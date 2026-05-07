import { router } from "../trpc";
import { authRouter } from "../../domain/auth";
import { userRouter } from "../../domain/user";
import { roleRouter } from "../../domain/role";
import { permissionRouter } from "../../domain/permission";
import { fileRouter } from "../../domain/file";
import { teamRouter } from "../../domain/team";
import { notificationRouter } from "../../domain/notification";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  role: roleRouter,
  permission: permissionRouter,
  file: fileRouter,
  team: teamRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
