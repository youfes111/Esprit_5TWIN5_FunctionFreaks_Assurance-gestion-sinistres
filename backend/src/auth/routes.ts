import { Router } from "express";
import { AppError } from "../middleware/app-error.js";
import type { AuthService } from "./service.js";
import { TurnstileVerifier } from "./turnstile.js";
import {
  requireAuth,
  requirePermission,
  issueCsrf,
  setSession,
  clearSession,
  readCookie,
  cookieNames,
} from "./middleware.js";
import { publicUser } from "./types.js";
import { object, email } from "./validation.js";
export function authRoutes(
  service: AuthService,
  verifier = new TurnstileVerifier(service.config),
) {
  const router = Router();
  router.get("/csrf", (req, res) =>
    res.json({
      success: true,
      data: {
        csrfToken: issueCsrf(req, res, service.config),
        siteKey: service.config.turnstileSiteKey,
      },
    }),
  );
  router.get("/me", requireAuth, (req, res) =>
    res.json({ success: true, data: publicUser(req.auth!.user) }),
  );
  router.post("/login", async (req, res) => {
    const body = object(req.body, ["email", "password", "captchaToken"]);
    const address = email(body.email);
    try {
      const verification = await verifier.verify(body.captchaToken);
      // The official passing test widget may return the same deterministic
      // dummy token on every attempt. Siteverify remains mandatory; only skip
      // our secondary one-time digest check after its successful exact-pair result.
      if (!verification.officialTestToken) {
        try {
          service.useCaptcha(String(body.captchaToken));
        } catch (error) {
          if (error instanceof AppError && error.code === "CAPTCHA_INVALID")
            verifier.recordReplay();
          throw error;
        }
      }
    } catch (error) {
      service.store.audit("LOGIN_CAPTCHA_REJECTED");
      throw error;
    }
    const result = await service.login(
      address,
      body.password,
      readCookie(req, cookieNames(service.config).session),
    );
    setSession(res, service.config, result.token);
    res.json({ success: true, data: result.user });
  });
  router.post("/logout", requireAuth, (req, res) => {
    service.logout(req.auth!.token);
    clearSession(res, service.config);
    res.json({ success: true, data: { loggedOut: true } });
  });
  router.post("/activate", async (req, res) => {
    service.rateLimit(`activate:${req.ip ?? "local"}`, 10);
    await service.activate(req.body);
    res.json({ success: true, data: { activated: true } });
  });
  router.post("/change-password", requireAuth, async (req, res) => {
    service.rateLimit(`password:${req.auth!.user.id}`, 5);
    await service.changePassword(req.auth!.user.id, req.body);
    clearSession(res, service.config);
    res.json({ success: true, data: { changed: true } });
  });
  router.patch("/profile", requireAuth, (req, res) =>
    res.json({
      success: true,
      data: service.profile(req.auth!.user.id, req.body),
    }),
  );
  router.use(() => {
    throw new AppError(404, "NOT_FOUND", "Route introuvable.");
  });
  return router;
}
export function userRoutes(service: AuthService) {
  const router = Router();
  router.use(requirePermission("users:manage"));
  router.get("/", (req, res) =>
    res.json({ success: true, data: service.list(req.query) }),
  );
  router.post("/", (req, res) => {
    service.rateLimit(`admin-create:${req.auth!.user.id}`, 30);
    res
      .status(201)
      .json({
        success: true,
        data: service.create(req.auth!.user.id, req.body),
      });
  });
  router.patch("/:id", (req, res) =>
    res.json({
      success: true,
      data: service.update(req.auth!.user.id, String(req.params.id), req.body),
    }),
  );
  router.post("/:id/password-setup", (req, res) => {
    service.rateLimit(`reset:${req.auth!.user.id}`, 20);
    res.json({
      success: true,
      data: service.reset(req.auth!.user.id, String(req.params.id)),
    });
  });
  return router;
}
