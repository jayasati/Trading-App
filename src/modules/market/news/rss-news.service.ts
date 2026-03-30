import { Injectable } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";

@Injectable()
export class RssNewsService {
  private parser = new XMLParser();

  async fetch(symbol: string) {
    const url = `https://finance.yahoo.com/rss/headline?s=${symbol}`;
    const res = await fetch(url);
    const xml = await res.text();

    const parsed = this.parser.parse(xml);
    const items = parsed?.rss?.channel?.item ?? [];

    return items.slice(0, 10).map((i: any) => ({
      title: i.title,
      link: i.link,
    }));
  }
}