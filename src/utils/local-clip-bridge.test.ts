import { describe, expect, test } from 'vitest';
import { extractMarkdownAssetUrls } from './local-clip-bridge';

describe('extractMarkdownAssetUrls', () => {
	test('collects markdown image syntax and direct image links', () => {
		const markdown = [
			'![](https://wx2.sinaimg.cn/large/abc123.jpg)',
			'[查看图片](https://wx2.sinaimg.cn/large/def456.jpg)',
			'[普通链接](https://weibo.com/10503/QrENs9Cxp)',
		].join('\n');

		expect(extractMarkdownAssetUrls(markdown)).toEqual([
			'https://wx2.sinaimg.cn/large/abc123.jpg',
			'https://wx2.sinaimg.cn/large/def456.jpg',
		]);
	});

	test('collects html img and anchor image urls without duplicates', () => {
		const markdown = [
			'<img src="https://wx2.sinaimg.cn/large/abc123.jpg" />',
			'<a href="https://wx2.sinaimg.cn/large/abc123.jpg">查看图片</a>',
			'<a href="https://weibo.com/10503/QrENs9Cxp">微博</a>',
		].join('\n');

		expect(extractMarkdownAssetUrls(markdown)).toEqual([
			'https://wx2.sinaimg.cn/large/abc123.jpg',
		]);
	});
});
