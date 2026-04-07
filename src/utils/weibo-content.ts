export function enhanceWeiboContentHtml(
	contentHtml: string,
	document: Document | undefined,
	pageUrl: string
): string {
	if (!document) {
		return contentHtml;
	}

	const sanitizedContentHtml = isTwitterStatusUrl(pageUrl)
		? stripTwitterQuotedContent(contentHtml, pageUrl)
		: contentHtml;
	const existingUrls = extractImageUrlsFromHtml(sanitizedContentHtml, pageUrl);
	const sourceUrls = isWeiboUrl(pageUrl)
		? extractWeiboImageUrls(document, pageUrl)
		: isTwitterUrl(pageUrl)
			? extractTwitterImageUrls(document, pageUrl)
			: [];
	const candidateUrls = sourceUrls.filter(url => !existingUrls.has(url));

	if (candidateUrls.length === 0) {
		return sanitizedContentHtml;
	}

	const imageHtml = candidateUrls
		.map(url => `<p><img src="${escapeHtml(url)}" /></p>`)
		.join('');

	return `${sanitizedContentHtml}${sanitizedContentHtml.trim() ? '\n' : ''}${imageHtml}`;
}

export function getDefuddleOptions(pageUrl: string): { url: string; includeReplies?: boolean } {
	return isTwitterStatusUrl(pageUrl)
		? { url: pageUrl, includeReplies: false }
		: { url: pageUrl };
}

function extractWeiboImageUrls(document: Document, pageUrl: string): string[] {
	const domUrls = extractWeiboImageUrlsFromDom(document, pageUrl);
	if (domUrls.length > 0) {
		return Array.from(new Set(domUrls));
	}

	const scriptUrls = extractWeiboImageUrlsFromScripts(document, pageUrl);
	return Array.from(new Set(scriptUrls));
}

function extractTwitterImageUrls(document: Document, pageUrl: string): string[] {
	const root = getTwitterImageRoot(document, pageUrl);
	const urls = [
		...extractTwitterImageUrlsFromDom(root, pageUrl),
		...(shouldExtractTwitterImagesFromScripts(document, pageUrl)
			? extractTwitterImageUrlsFromScripts(document, pageUrl)
			: []),
	];

	return Array.from(new Set(urls));
}

function extractWeiboImageUrlsFromDom(document: Document, pageUrl: string): string[] {
	const images = Array.from(document.querySelectorAll('img'));
	const urls: string[] = [];

	for (const image of images) {
		const candidates = [
			(image as HTMLImageElement).currentSrc,
			image.getAttribute('src') || '',
			selectLargestSrcsetCandidate(image.getAttribute('srcset') || ''),
		];

		for (const candidate of candidates) {
			const normalized = normalizeUrl(candidate, pageUrl);
			if (normalized && isLikelyWeiboContentImage(normalized, image)) {
				urls.push(normalized);
			}
		}
	}

	const imageLinks = Array.from(document.querySelectorAll('a[href]'));
	for (const link of imageLinks) {
		const href = normalizeUrl(link.getAttribute('href') || '', pageUrl);
		if (href && isLikelyWeiboContentImageLink(href, link)) {
			urls.push(href);
		}
	}

	return urls;
}

function extractWeiboImageUrlsFromScripts(document: Document, pageUrl: string): string[] {
	const scripts = Array.from(document.querySelectorAll('script'))
		.map(script => script.textContent || '')
		.filter(Boolean)
		.map(text => text.replace(/\\\//g, '/'));
	const urls: string[] = [];
	const pattern = /https?:\/\/[^"'\s]+sinaimg\.cn[^"'\s]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"'\s]*)?/gi;

	for (const scriptText of scripts) {
		for (const match of scriptText.matchAll(pattern)) {
			const normalized = normalizeUrl(match[0], pageUrl);
			if (normalized && isLikelyWeiboContentImage(normalized)) {
				urls.push(normalized);
			}
		}
	}

	return urls;
}

function extractTwitterImageUrlsFromDom(root: ParentNode, pageUrl: string): string[] {
	const images = Array.from(root.querySelectorAll('img'));
	const urls: string[] = [];

	for (const image of images) {
		const candidates = [
			(image as HTMLImageElement).currentSrc,
			image.getAttribute('src') || '',
			selectLargestSrcsetCandidate(image.getAttribute('srcset') || ''),
		];

		for (const candidate of candidates) {
			const normalized = normalizeUrl(candidate, pageUrl);
			if (normalized && isLikelyTwitterContentImage(normalized, image)) {
				urls.push(normalized);
			}
		}
	}

	return urls;
}

function getTwitterImageRoot(document: Document, pageUrl: string): ParentNode {
	if (!isTwitterStatusUrl(pageUrl)) {
		return document;
	}

	const timeline = document.querySelector('[aria-label="Timeline: Conversation"], section[aria-label="对话"]');
	const mainTweet = timeline?.querySelector('article[data-testid="tweet"]')
		|| document.querySelector('main article[data-testid="tweet"]')
		|| document.querySelector('article[data-testid="tweet"]');

	return mainTweet || document;
}

function shouldExtractTwitterImagesFromScripts(document: Document, pageUrl: string): boolean {
	if (!isTwitterStatusUrl(pageUrl)) {
		return true;
	}

	return document.querySelectorAll('article[data-testid="tweet"]').length <= 1;
}

function extractTwitterImageUrlsFromScripts(document: Document, pageUrl: string): string[] {
	const scripts = Array.from(document.querySelectorAll('script'))
		.map(script => script.textContent || '')
		.filter(Boolean)
		.map(text => text.replace(/\\\//g, '/'));
	const urls: string[] = [];
	const pattern = /https?:\/\/pbs\.twimg\.com\/media\/[^"'\s]+(?:\?[^"'\s]*)?/gi;

	for (const scriptText of scripts) {
		for (const match of scriptText.matchAll(pattern)) {
			const normalized = normalizeUrl(match[0], pageUrl);
			if (normalized && isLikelyTwitterContentImage(normalized)) {
				urls.push(normalized);
			}
		}
	}

	return urls;
}

function extractImageUrlsFromHtml(contentHtml: string, pageUrl: string): Set<string> {
	const urls = new Set<string>();
	for (const match of contentHtml.matchAll(/<img[^>]+src=["']([^"']+)/gi)) {
		const normalized = normalizeUrl(match[1], pageUrl);
		if (normalized) {
			urls.add(normalized);
		}
	}
	return urls;
}

function selectLargestSrcsetCandidate(srcset: string): string {
	if (!srcset) {
		return '';
	}

	const parts = srcset
		.split(',')
		.map(part => part.trim())
		.filter(Boolean);

	if (parts.length === 0) {
		return '';
	}

	return parts[parts.length - 1].split(/\s+/)[0] || '';
}

function normalizeUrl(value: string, pageUrl: string): string {
	if (!value) {
		return '';
	}

	try {
		return new URL(value, pageUrl).href;
	} catch {
		return '';
	}
}

function isLikelyWeiboContentImage(url: string, element?: Element): boolean {
	try {
		const parsed = new URL(url);
		if (!/(^|\.)sinaimg\.cn$/i.test(parsed.hostname)) {
			return false;
		}

		if (!/\.(jpg|jpeg|png|gif|webp)(?:[?#].*)?$/i.test(parsed.pathname)) {
			return false;
		}

		if (/(avatar|profile|head|icon|emoji|logo|verify|player|cover|mask)/i.test(parsed.pathname)) {
			return false;
		}

		const classText = [
			element?.getAttribute('class') || '',
			element?.parentElement?.getAttribute('class') || '',
			element?.closest('[class]')?.getAttribute('class') || '',
		].join(' ').toLowerCase();

		if (/(avatar|profile|head|icon|emoji|logo|verify|player|cover|mask)/i.test(classText)) {
			return false;
		}

		const width = Number(element?.getAttribute('width') || 0);
		const height = Number(element?.getAttribute('height') || 0);
		if (width > 0 && height > 0 && width <= 120 && height <= 120) {
			return false;
		}

		if (/\/(large|orj360|mw\d+|bmiddle|original|crop\.)\//i.test(parsed.pathname)) {
			return true;
		}

		return !!element?.closest('article, main, [role="main"], [class*="detail"], [class*="content"], [class*="feed"]');
	} catch {
		return false;
	}
}

function isLikelyWeiboContentImageLink(url: string, element?: Element): boolean {
	try {
		const parsed = new URL(url);
		if (!/(^|\.)sinaimg\.cn$/i.test(parsed.hostname)) {
			return false;
		}

		if (!/\.(jpg|jpeg|png|gif|webp)(?:[?#].*)?$/i.test(parsed.pathname)) {
			return false;
		}

		const classText = [
			element?.getAttribute('class') || '',
			element?.parentElement?.getAttribute('class') || '',
			element?.closest('[class]')?.getAttribute('class') || '',
		].join(' ').toLowerCase();
		if (/(avatar|profile|head|icon|emoji|logo|verify|player|cover|mask)/i.test(classText)) {
			return false;
		}

		return !!element?.closest('article, main, [role="main"], [class*="detail"], [class*="content"], [class*="feed"], [class*="wbtext"]');
	} catch {
		return false;
	}
}

function isLikelyTwitterContentImage(url: string, element?: Element): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.hostname.toLowerCase() !== 'pbs.twimg.com') {
			return false;
		}
		if (!parsed.pathname.startsWith('/media/')) {
			return false;
		}

		if (!element) {
			return true;
		}

		const classText = [
			element.getAttribute('class') || '',
			element.parentElement?.getAttribute('class') || '',
			element.closest('[class]')?.getAttribute('class') || '',
		].join(' ').toLowerCase();
		if (/(avatar|profile|icon)/i.test(classText)) {
			return false;
		}

		return !!element.closest('article, main, [data-testid="primaryColumn"]');
	} catch {
		return false;
	}
}

function isWeiboUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname === 'weibo.com'
			|| hostname.endsWith('.weibo.com')
			|| hostname === 'm.weibo.cn'
			|| hostname === 'weibo.cn';
	} catch {
		return false;
	}
}

function isTwitterUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname === 'x.com'
			|| hostname.endsWith('.x.com')
			|| hostname === 'twitter.com'
			|| hostname.endsWith('.twitter.com');
	} catch {
		return false;
	}
}

function isTwitterStatusUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return isTwitterUrl(url) && /^\/(?:(?:i(?:\/web)?|[^/]+)\/status\/\d+)/i.test(parsed.pathname);
	} catch {
		return false;
	}
}

function stripTwitterQuotedContent(contentHtml: string, pageUrl: string): string {
	if (!contentHtml.includes('quoted-tweet')) {
		return contentHtml;
	}

	return contentHtml
		.replace(
			/<blockquote\b[^>]*class=["'][^"']*\bquoted-tweet\b[^"']*["'][^>]*>[\s\S]*?<\/blockquote>/gi,
			match => buildTwitterQuotedContentPlaceholder(match, pageUrl)
		)
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function buildTwitterQuotedContentPlaceholder(quotedHtml: string, pageUrl: string): string {
	const label = extractTwitterQuotedContentLabel(quotedHtml);
	const message = label
		? `引用内容未展开：${label}`
		: '引用内容未展开';

	return `<p><em>${escapeHtml(message)}，请返回 <a href="${escapeHtml(pageUrl)}">原始 X 帖子</a> 查看。</em></p>`;
}

function extractTwitterQuotedContentLabel(quotedHtml: string): string {
	const text = quotedHtml
		.replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.split('\n')
		.map(line => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean);

	return text.find(line => {
		if (line === '引用') {
			return false;
		}
		if (/^@\w+/.test(line)) {
			return false;
		}
		if (/^\d{4}-\d{2}-\d{2}$/.test(line)) {
			return false;
		}
		return line.length >= 8;
	}) || '';
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
