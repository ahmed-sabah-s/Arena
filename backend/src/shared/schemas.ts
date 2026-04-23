// Re-exports from the monorepo shared package.
// All Zod schemas live in shared/src/schemas/ — single source of truth for BE, FE, and mobile.
// To add a new schema: create shared/src/schemas/[feature].schemas.ts then barrel-export it from shared/src/schemas/index.ts
export * from '@shared/schemas';
