import browser from './browser-polyfill';
import { Template } from '../types/types';

const LOCAL_BRIDGE_URL = 'http://127.0.0.1:27124/api/weibo-clip';

interface DownloadedAsset {
	url: string;
	filename: string;
	mimeType: string;
	base64: string;
}

interface SaveClipPayload {
	tabId: number;
	pageUrl: string;
	fileContent: string;
	noteName: string;
	path: string;
	vault: string;
	behavior: Template['behavior'];
}

export async function trySaveWeiboClipViaLocalBridge(payload: SaveClipPayload): Promise<boolean> {
	if (payload.behavior === 'append-daily' || payload.behavior === 'prepend-daily') {
		return false;
	}

	const imageUrls = extractMarkdownImageUrls(payload.fileContent);

	const response = await browser.tabs.sendMessage(payload.tabId, {
		action: 'downloadWeiboAssets',
		urls: imageUrls,
	}) as { assets?: DownloadedAsset[]; success?: boolean; error?: string };

	if (!response?.success) {
		throw new Error(response?.error || 'Failed to download page assets');
	}

	const clipResponse = await fetch(LOCAL_BRIDGE_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vault: payload.vault,
			noteName: payload.noteName,
			path: payload.path,
			behavior: payload.behavior,
			fileContent: payload.fileContent,
			assets: response.assets,
			sourceUrl: payload.pageUrl,
		}),
	});

	if (!clipResponse.ok) {
		const errorText = await clipResponse.text().catch(() => '');
		throw new Error(errorText || `Local bridge failed with ${clipResponse.status}`);
	}

	return true;
}

function extractMarkdownImageUrls(markdown: string): string[] {
	const urls = new Set<string>();

	for (const match of markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
		urls.add(match[1]);
	}

	for (const match of markdown.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)/gi)) {
		urls.add(match[1]);
	}

	return Array.from(urls);
}

