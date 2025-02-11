import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import timezone from '@/utils/timezone';
import { parseDate } from '@/utils/parse-date';

const categories = {
    社会: 'shehui',
    娱乐: 'yule',
    国际: 'guoji',
    军事: 'junshi',
    养生: 'yangsheng',
    汽车: 'qiche',
    体育: 'tiyu',
    财经: 'caijing',
    游戏: 'youxi',
    科技: 'keji',
    国内: 'guonei',
    宠物: 'chongwu',
    情感: 'qinggan',
    人文: 'renwen',
    教育: 'jiaoyu',
};

export const route: Route = {
    path: '/24/:category?',
    categories: ['traditional-media'],
    example: '/eastday/24',
    parameters: { category: '分类，见下表，默认为社会' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['mini.eastday.com/'],
            target: '/24',
        },
    ],
    name: '24 小时热闻',
    maintainers: ['nczitzk'],
    handler,
    url: 'mini.eastday.com/',
    description: `| 推荐 | 社会 | 娱乐 | 国际 | 军事 |
| ---- | ---- | ---- | ---- | ---- |

| 养生 | 汽车 | 体育 | 财经 | 游戏 |
| ---- | ---- | ---- | ---- | ---- |

| 科技 | 国内 | 宠物 | 情感 | 人文 | 教育 |
| ---- | ---- | ---- | ---- | ---- | ---- |`,
};

async function handler(ctx) {
    const category = ctx.req.param('category') ?? '社会';

    const rootUrl = 'https://mini.eastday.com';
    const currentUrl = `${rootUrl}/ns/api/detail/trust/trust-news-${categories[category]}.json`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const list = JSON.parse(response.data.match(/\((.*)\)/)[1]).data.trust.map((item) => ({
        title: item.topic,
        link: `${rootUrl}${item.url}`,
    }));

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: item.link,
                });

                const content = load(detailResponse.data);

                const pageNumber = Number.parseInt(detailResponse.data.match(/var page_num = '(\d+)'/)[1]);

                item.description = content('#J-contain_detail_cnt').html();
                item.pubDate = timezone(parseDate(content('meta[property="og:release_date"]').attr('content')), +8);

                if (pageNumber > 1) {
                    const links = [];

                    for (let i = 2; i <= pageNumber; i++) {
                        links.push(item.link.replace(/\.html/, `-${i}.html`));
                    }

                    for (const link of links) {
                        cache.tryGet(link, async () => {
                            const pageResponse = await got({
                                method: 'get',
                                url: link,
                            });
                            const subContent = load(pageResponse.data);

                            subContent('img').each(function () {
                                subContent(this).attr('src', subContent(this).attr('data-url'));
                            });

                            item.description += subContent('#J-contain_detail_cnt').html();
                        });
                    }
                }

                return item;
            })
        )
    );

    return {
        title: `24小时${category}热闻 - 东方资讯`,
        link: `${rootUrl}/#${categories[category]}`,
        item: items,
    };
}
