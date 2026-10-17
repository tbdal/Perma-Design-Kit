import { configDefaults, defineConfig } from 'vitest/config';

// Other sessions keep git worktrees under .claude/worktrees (also inside src/expert): their copies of the tests are not ours.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '**/.claude/**'] } });
