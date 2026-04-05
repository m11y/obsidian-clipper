import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { enhanceWeiboContentHtml } from './weibo-content';

describe('enhanceWeiboContentHtml', () => {
	test('appends missing weibo content images from scripts', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article><p>微博正文</p></article>
					<script>
						window.__INITIAL_STATE__ = {
							status: {
								pic_infos: {
									abc: { largest: { url: "https:\/\/wx1.sinaimg.cn\/large\/abc123.jpg" } },
									def: { largest: { url: "https:\/\/wx2.sinaimg.cn\/mw2000\/def456.png" } }
								}
							}
						};
					</script>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml('<p>微博正文</p>', document as unknown as Document, 'https://weibo.com/123/abc');

		expect(result).toContain('https://wx1.sinaimg.cn/large/abc123.jpg');
		expect(result).toContain('https://wx2.sinaimg.cn/mw2000/def456.png');
	});

	test('appends missing twitter content images from scripts', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article><p>tweet body</p></article>
					<script>
						window.__INITIAL_STATE__ = {
							entities: {
								media: [
									{ media_url_https: "https:\/\/pbs.twimg.com\/media\/AbCdEfX.jpg?format=jpg&name=large" }
								]
							}
						};
					</script>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml('<p>tweet body</p>', document as unknown as Document, 'https://x.com/demo/status/1');

		expect(result).toContain('https://pbs.twimg.com/media/AbCdEfX.jpg?format=jpg&amp;name=large');
	});

	test('does not duplicate images already present in content', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article>
						<p>微博正文</p>
						<img src="https://wx1.sinaimg.cn/large/abc123.jpg" />
					</article>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			'<p>微博正文</p><p><img src="https://wx1.sinaimg.cn/large/abc123.jpg" /></p>',
			document as unknown as Document,
			'https://weibo.com/123/abc'
		);

		expect(result.match(/abc123\.jpg/g)).toHaveLength(1);
	});
});
