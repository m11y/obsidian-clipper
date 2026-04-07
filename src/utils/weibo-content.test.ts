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

	test('does not append script-only weibo images when content dom already has an image', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article>
						<p>微博正文</p>
						<img src="https://wx1.sinaimg.cn/large/main123.jpg" />
					</article>
					<script>
						window.__INITIAL_STATE__ = {
							status: {
								pic_infos: {
									main: { largest: { url: "https:\/\/wx1.sinaimg.cn\/large\/main123.jpg" } },
									other: { largest: { url: "https:\/\/wx2.sinaimg.cn\/mw690\/other456.jpg" } }
								}
							}
						};
					</script>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			'<p>微博正文</p><p><img src="https://wx1.sinaimg.cn/large/main123.jpg" /></p>',
			document as unknown as Document,
			'https://weibo.com/10503/QrFmukmRU'
		);

		expect(result).toContain('https://wx1.sinaimg.cn/large/main123.jpg');
		expect(result).not.toContain('other456.jpg');
	});

	test('extracts weibo image links from 查看图片 anchors', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article>
						<div class="_wbtext_q1l14_14">
							如果不理解最近技术文章说的 agent loop 是什么效果，可以参看这个不太正面但似乎也很尽职的 agent 示例
							<a target="_blank" data-pid="00002907gy1ia93a6k08kj20wr0zagrl" href="https://wx2.sinaimg.cn/large/00002907gy1ia93a6k08kj20wr0zagrl.jpg">
								<img class="icon-link" title="http://t.cn/AXtUQXTl" src="https://h5.sinaimg.cn/upload/2015/01/21/20/timeline_card_small_photo_default.png">
								查看图片
							</a>
						</div>
					</article>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			'<p>如果不理解最近技术文章说的 agent loop 是什么效果，可以参看这个不太正面但似乎也很尽职的 agent 示例</p>',
			document as unknown as Document,
			'https://weibo.com/10503/QrENs9Cxp'
		);

		expect(result).toContain('https://wx2.sinaimg.cn/large/00002907gy1ia93a6k08kj20wr0zagrl.jpg');
		expect(result).not.toContain('timeline_card_small_photo_default.png');
	});
});
