const http = require('http');
const path = require('path');
const { Plugin, Notice, TFile, normalizePath } = require('obsidian');

const HOST = '127.0.0.1';
const PORT = 27124;
const MAX_BODY_SIZE = 50 * 1024 * 1024;

module.exports = class WeiboLocalAssetsBridgePlugin extends Plugin {
	async onload() {
		this.server = http.createServer(this.handleRequest.bind(this));
		await new Promise((resolve, reject) => {
			this.server.once('error', reject);
			this.server.listen(PORT, HOST, () => {
				this.server.off('error', reject);
				resolve();
			});
		});
		new Notice(`Weibo Local Assets Bridge listening on ${HOST}:${PORT}`);
	}

	onunload() {
		if (this.server) {
			this.server.close();
		}
	}

	async handleRequest(req, res) {
		this.setCorsHeaders(res);
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.method !== 'POST' || req.url !== '/api/weibo-clip') {
			this.sendJson(res, 404, { error: 'Not found' });
			return;
		}

		try {
			const body = await this.readRequestBody(req);
			const payload = JSON.parse(body);
			const result = await this.saveClip(payload);
			this.sendJson(res, 200, result);
		} catch (error) {
			console.error('[WeiboLocalAssetsBridge] request failed', error);
			this.sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
		}
	}

	setCorsHeaders(res) {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
	}

	sendJson(res, status, data) {
		res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify(data));
	}

	readRequestBody(req) {
		return new Promise((resolve, reject) => {
			let size = 0;
			const chunks = [];
			req.on('data', chunk => {
				size += chunk.length;
				if (size > MAX_BODY_SIZE) {
					req.destroy(new Error('Request body too large'));
					return;
				}
				chunks.push(chunk);
			});
			req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			req.on('error', reject);
		});
	}

	async saveClip(payload) {
		const vaultName = this.app.vault.getName();
		if (payload.vault && payload.vault !== vaultName) {
			throw new Error(`Vault mismatch: plugin is running in ${vaultName}, payload targets ${payload.vault}`);
		}

		if (!payload.noteName || typeof payload.noteName !== 'string') {
			throw new Error('noteName is required');
		}

		if (payload.behavior === 'append-daily' || payload.behavior === 'prepend-daily') {
			throw new Error('Daily note behaviors are not supported by the local bridge yet');
		}

		const monthBucket = inferMonthBucket(payload.fileContent || '');
		const collectionRoot = inferCollectionRoot(payload.sourceUrl || '');
		const assetsRoot = `${collectionRoot}/assets`;
		const normalizedPath = (payload.path || '').replace(/\/+$/, '');
		const relativePath = inferRelativeNotePath(collectionRoot, normalizedPath, payload.noteName);
		const notePath = normalizePath(`${collectionRoot}/${monthBucket}/${relativePath}`);
		const noteDir = path.posix.dirname(notePath);
		const noteBaseName = stripMarkdownExtension(path.posix.basename(notePath));
		const assetDir = normalizePath(`${assetsRoot}/${monthBucket}/${sanitizeSegment(noteBaseName)}`);

		await this.ensureFolder(noteDir === '.' ? '' : noteDir);
		await this.ensureFolder(assetDir);

		const replacements = new Map();
		const savedAssets = [];
		for (let index = 0; index < (payload.assets || []).length; index += 1) {
			const asset = payload.assets[index];
			if (!asset?.base64 || !asset?.url) {
				continue;
			}

			const assetBaseName = inferAssetBaseName(asset.filename, index + 1);
			const extension = inferExtension(asset.filename, asset.mimeType);
			const assetPath = await this.getAvailablePath(`${assetDir}/${assetBaseName}.${extension}`);
			const buffer = Buffer.from(asset.base64, 'base64');
			const binary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
			await this.app.vault.adapter.writeBinary(assetPath, binary);
			replacements.set(asset.url, assetPath);
			savedAssets.push(assetPath);
		}

		const rewrittenContent = rewriteMarkdownAssetLinks(payload.fileContent || '', replacements);
		await this.writeNote(notePath, rewrittenContent, payload.behavior || 'create');
		return { notePath, assets: savedAssets };
	}

	async writeNote(notePath, content, behavior) {
		const existing = this.app.vault.getAbstractFileByPath(notePath);
		if (existing instanceof TFile) {
			if (behavior === 'append-specific') {
				await this.app.vault.process(existing, current => `${current}${current && !current.endsWith('\n') ? '\n' : ''}${content}`);
				return;
			}
			if (behavior === 'prepend-specific') {
				await this.app.vault.process(existing, current => `${content}${content && !content.endsWith('\n') ? '\n' : ''}${current}`);
				return;
			}
			await this.app.vault.modify(existing, content);
			return;
		}

		await this.app.vault.create(notePath, content);
	}

	async ensureFolder(folderPath) {
		if (!folderPath) {
			return;
		}

		const parts = normalizePath(folderPath).split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.app.vault.adapter.exists(current))) {
				await this.app.vault.createFolder(current).catch(error => {
					if (!String(error).includes('Folder already exists')) {
						throw error;
					}
				});
			}
		}
	}

	async getAvailablePath(basePath) {
		if (!(await this.app.vault.adapter.exists(basePath))) {
			return basePath;
		}

		const extension = path.posix.extname(basePath);
		const stem = basePath.slice(0, -extension.length);
		let counter = 2;
		while (await this.app.vault.adapter.exists(`${stem}-${counter}${extension}`)) {
			counter += 1;
		}
		return `${stem}-${counter}${extension}`;
	}
};

function rewriteMarkdownAssetLinks(markdown, replacements) {
	let output = markdown;
	for (const [url, assetPath] of replacements.entries()) {
		const escapedUrl = escapeRegExp(url);
		output = output.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, 'g'), `![[${assetPath}]]`);
		output = output.replace(new RegExp(`<img[^>]+src=["']${escapedUrl}["'][^>]*>`, 'gi'), `![[${assetPath}]]`);
		output = output.replace(
			new RegExp(`\\[([^\\]]*)\\]\\(${escapedUrl}\\)`, 'g'),
			(_, label) => `[[${assetPath}|${sanitizeWikiLinkAlias(label)}]]`
		);
		output = output.replace(
			new RegExp(`<a[^>]+href=["']${escapedUrl}["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi'),
			(_, label) => `[[${assetPath}|${sanitizeWikiLinkAlias(stripHtml(label))}]]`
		);
	}
	return output;
}

function ensureMarkdownExtension(noteName) {
	return noteName.toLowerCase().endsWith('.md') ? noteName : `${noteName}.md`;
}

function stripMarkdownExtension(noteName) {
	return noteName.replace(/\.md$/i, '');
}

function inferCollectionRoot(sourceUrl) {
	try {
		const hostname = new URL(sourceUrl).hostname.toLowerCase();
		if (hostname === 'weibo.com' || hostname.endsWith('.weibo.com') || hostname === 'm.weibo.cn' || hostname === 'weibo.cn') {
			return '05 微博收藏';
		}
		if (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) {
			return '06 Twitter 收藏';
		}
	} catch {}
	return 'clippings';
}

function inferRelativeNotePath(collectionRoot, normalizedPath, noteName) {
	const noteFile = ensureMarkdownExtension(noteName);
	if (normalizedPath === 'Clippings') {
		return noteFile;
	}
	if ((collectionRoot === '微博收藏' || collectionRoot === 'Twitter 收藏') && normalizedPath === 'Clippings') {
		return noteFile;
	}
	return `${normalizedPath ? normalizedPath + '/' : ''}${noteFile}`;
}

function inferMonthBucket(fileContent) {
	const match = fileContent.match(/^published:\s*(\d{4}-\d{2})/m);
	if (match) {
		return match[1];
	}
	return new Date().toISOString().slice(0, 7);
}

function inferAssetBaseName(filename, fallbackIndex) {
	const raw = path.posix.basename(filename || '').replace(/\.[^.]+$/, '');
	const cleaned = sanitizeSegment(raw);
	return cleaned === 'clip' ? `weibo-${String(fallbackIndex).padStart(2, '0')}` : cleaned;
}

function inferExtension(filename, mimeType) {
	const fromName = path.posix.extname(filename || '').replace(/^\./, '');
	if (fromName) {
		return fromName;
	}
	if ((mimeType || '').includes('png')) return 'png';
	if ((mimeType || '').includes('gif')) return 'gif';
	if ((mimeType || '').includes('webp')) return 'webp';
	return 'jpg';
}

function sanitizeSegment(value) {
	return value.replace(/[\\/:*?"<>|#^\[\]]/g, '-').trim() || 'clip';
}

function sanitizeWikiLinkAlias(value) {
	const normalized = String(value || '').replace(/\s+/g, ' ').trim();
	return (normalized || '查看图片').replace(/[|\]]/g, ' ');
}

function stripHtml(value) {
	return String(value || '').replace(/<[^>]+>/g, ' ');
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
