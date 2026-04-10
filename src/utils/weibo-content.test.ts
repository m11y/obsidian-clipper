import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { enhanceWeiboContentHtml, getDefuddleOptions } from './weibo-content';

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

	test('does not append an inline image when the weibo content already links to it', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article>
						<div class="_wbtext_q1l14_14">
							如果不理解最近技术文章说的 agent loop 是什么效果
							<a target="_blank" data-pid="00002907gy1ia93a6k08kj20wr0zagrl" href="https://wx2.sinaimg.cn/large/00002907gy1ia93a6k08kj20wr0zagrl.jpg">查看图片</a>
						</div>
					</article>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			'<p>如果不理解最近技术文章说的 agent loop 是什么效果 <a href="https://wx2.sinaimg.cn/large/00002907gy1ia93a6k08kj20wr0zagrl.jpg">查看图片</a></p>',
			document as unknown as Document,
			'https://weibo.com/10503/QrENs9Cxp'
		);

		expect(result).toContain('<a href="https://wx2.sinaimg.cn/large/00002907gy1ia93a6k08kj20wr0zagrl.jpg">查看图片</a>');
		expect(result).not.toContain('<img src="https://wx2.sinaimg.cn/large/00002907gy1ia93a6k08kj20wr0zagrl.jpg"');
	});

	test('removes weibo visibility labels and repost tail blocks after the source timestamp', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article>
						<p>公开</p>
						<p>如果不理解最近技术文章说的 agent loop 是什么效果</p>
						<p><a href="https://weibo.com/10503/QrDcN49nA">26-2-13 13:41</a></p>
						<p><img src="https://wx2.sinaimg.cn/mw690/00002907gy1i3ujuvyz4zj20u00u0q8p.jpg" /></p>
					</article>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			[
				'<p>公开</p>',
				'<p>如果不理解最近技术文章说的 agent loop 是什么效果</p>',
				'<p><a href="https://weibo.com/10503/QrDcN49nA">26-2-13 13:41</a></p>',
				'<p><img src="https://wx2.sinaimg.cn/mw690/00002907gy1i3ujuvyz4zj20u00u0q8p.jpg" /></p>',
			].join(''),
			document as unknown as Document,
			'https://weibo.com/10503/QrENs9Cxp'
		);

		expect(result).toContain('如果不理解最近技术文章说的 agent loop 是什么效果');
		expect(result).not.toContain('公开');
		expect(result).not.toContain('26-2-13 13:41');
		expect(result).not.toContain('00002907gy1i3ujuvyz4zj20u00u0q8p.jpg');
	});

	test('removes nested weibo visibility labels inside wrapper containers', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article>
						<div class="Feed_body_3R0rO">
							<div class="Feed_detail_3-6Qm">
								<span>公开</span>
							</div>
							<div class="Feed_detail_3-6Qm">
								<p>正文第一段</p>
							</div>
						</div>
					</article>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			'<div><div><span>公开</span></div><div><p>正文第一段</p></div></div>',
			document as unknown as Document,
			'https://weibo.com/10503/QrENs9Cxp'
		);

		expect(result).toContain('正文第一段');
		expect(result).not.toContain('公开');
	});

	test('replaces quoted tweet content with a placeholder linking back to the original x post', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<article data-testid="tweet">
						<p>tweet body</p>
					</article>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			'<div class="tweet"><div class="tweet-text"><p>tweet body</p></div><blockquote class="quoted-tweet"><div class="tweet-text"><p>quoted body that should not be expanded inline</p></div></blockquote></div>',
			document as unknown as Document,
			'https://x.com/demo/status/1'
		);

		expect(result).toContain('tweet body');
		expect(result).toContain('引用内容未展开：quoted body that should not be expanded inline');
		expect(result).toContain('href="https://x.com/demo/status/1"');
		expect(result).not.toContain('quoted-tweet');
	});

	test('only appends images from the main x tweet, not replies', () => {
		const { document } = parseHTML(`
			<html>
				<body>
					<section aria-label="对话">
						<article data-testid="tweet">
							<p>main tweet</p>
							<img src="https://pbs.twimg.com/media/MainImage.jpg?format=jpg&name=small" alt="main image" />
						</article>
						<article data-testid="tweet">
							<p>reply tweet</p>
							<img src="https://pbs.twimg.com/media/ReplyImage.jpg?format=jpg&name=small" alt="reply image" />
						</article>
					</section>
				</body>
			</html>
		`);

		const result = enhanceWeiboContentHtml(
			'<p>main tweet</p>',
			document as unknown as Document,
			'https://x.com/demo/status/1'
		);

		expect(result).toContain('https://pbs.twimg.com/media/MainImage.jpg?format=jpg&amp;name=small');
		expect(result).not.toContain('ReplyImage.jpg');
	});
});

describe('getDefuddleOptions', () => {
	test('disables replies for x status pages', () => {
		expect(getDefuddleOptions('https://x.com/demo/status/1')).toEqual({
			url: 'https://x.com/demo/status/1',
			includeReplies: false,
		});
	});

	test('keeps default options for non-status x pages', () => {
		expect(getDefuddleOptions('https://x.com/demo/article/1')).toEqual({
			url: 'https://x.com/demo/article/1',
		});
	});
});
