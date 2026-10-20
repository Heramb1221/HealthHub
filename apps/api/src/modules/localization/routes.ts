import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { SUPPORTED_LANGUAGES, CORE_DICTIONARY, translateContent } from "./bhashini.js";

const translateSchema = z.object({
  text: z.string().min(1).max(2000),
  sourceLang: z.enum(["en", "hi", "ta", "te", "mr", "bn"]).optional(),
  targetLang: z.enum(["en", "hi", "ta", "te", "mr", "bn"]),
});

export function createLocalizationRouter(env: Env) {
  const router = Router();

  router.get("/languages", (_req, res) => {
    res.json({
      data: {
        languages: SUPPORTED_LANGUAGES,
        default: "en",
      },
    });
  });

  router.get("/dictionary/:lang", (req, res) => {
    const lang = req.params.lang as keyof typeof CORE_DICTIONARY;
    const dict = CORE_DICTIONARY[lang] || CORE_DICTIONARY.en;
    res.json({
      data: {
        language: lang in CORE_DICTIONARY ? lang : "en",
        translations: dict,
      },
    });
  });

  router.post("/translate", async (req, res, next) => {
    try {
      const parsed = translateSchema.parse(req.body);
      const result = await translateContent(env, parsed);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
