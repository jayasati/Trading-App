import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class NewsApiService {
  constructor(private config: ConfigService) {}

  async fetch(symbol: string) {
    const key = this.config.get('NEWS_API_KEY');
    if (!key) return [];

    const url = `https://newsapi.org/v2/everything?q=${symbol}&apiKey=${key}`;
    const res = await fetch(url);
    const data = await res.json();

    return data.articles ?? [];
  }
}