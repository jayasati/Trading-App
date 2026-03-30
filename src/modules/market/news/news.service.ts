import { Injectable } from "@nestjs/common";
import { RssNewsService } from "./rss-news.service";
import { NewsApiService } from "./newsapi.service";

@Injectable()
export class NewsService {
  constructor(
    private rss: RssNewsService,
    private newsApi: NewsApiService,
  ) {}

  async fetch(symbol: string) {
    const rss = await this.rss.fetch(symbol);
    if (rss.length) return rss;

    return this.newsApi.fetch(symbol);
  }
}