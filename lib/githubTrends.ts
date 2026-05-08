import * as cheerio from "cheerio";
import type { TrendKeyword } from "./types";

const AI_KEYWORDS = [
  "ai", "artificial intelligence", "machine learning", "ml", "llm",
  "gpt", "claude", "chatgpt", "deepseek", "agent", "agentic",
  "transformer", "neural", "diffusion", "stable diffusion", "embedding",
  "rag", "fine-tuning", "openai", "langchain", "llamaindex",
];

function isAiRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return AI_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function fetchGithubTrends(): Promise<TrendKeyword[]> {
  try {
    const res = await fetch("https://github.com/trending?since=daily", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      console.error(`GitHub trending fetch failed: ${res.status}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const projects: TrendKeyword[] = [];

    $("article.Box-row").each((_, el) => {
      const titleEl = $(el).find("h2");
      const parts = titleEl
        .text()
        .trim()
        .split(/\s*\/\s*/)
        .map((s: string) => s.trim());

      if (parts.length < 2) return;

      const fullName = `${parts[0]}/${parts[1]}`;
      const description = $(el).find("p.col-9").text().trim();

      if (!isAiRelated(fullName) && !isAiRelated(description)) return;

      const starsEl = $(el).find('a[href$="/stargazers"]');
      const starsText = starsEl.text().trim().replace(/,/g, "");
      const stars = starsText ? `+${starsText}` : "";

      if (stars) {
        projects.push({
          name: fullName,
          value: stars,
          source: "GitHub Trends",
          url: `https://github.com/${fullName}`,
        });
      }
    });

    return projects;
  } catch (e) {
    console.error("GitHub trends fetch error:", e);
    return [];
  }
}
