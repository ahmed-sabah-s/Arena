import { inferAsyncReturnType } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { JwtService } from "../shared/security";

const jwtService = new JwtService();

export const createContext = async ({
  req,
  res,
}: CreateExpressContextOptions) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  let user: { id: string; email: string | null } | null = null;

  if (token) {
    try {
      const payload = jwtService.verifyAccessToken(token);
      user = { id: payload.userId, email: payload.email ?? null };
    } catch (error) {
      // Token is invalid, user remains null
    }
  }

  return {
    user,
    req,
    res,
  };
};

export type Context = inferAsyncReturnType<typeof createContext>;
