import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../../backend/src/presentation/routers/_app";

// Create tRPC React hooks
export const trpc = createTRPCReact<AppRouter>();
