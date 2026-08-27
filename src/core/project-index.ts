import type { FrameworkId, ProjectProfile } from '../types/core.js';
import type { FileRole } from '../detection/classify.js';
import type { SourceFile } from '../analysis/source-file.js';
import type { PackageJson } from '../detection/package-json.js';
import { SOURCE_EXTENSIONS } from '../filesystem/limits.js';

export interface ProjectIndexInit {
  readonly root: string;
  readonly profile: ProjectProfile;
  readonly files: readonly SourceFile[];
  /** Every repository-relative path the walker saw, including unread files. */
  readonly allPaths: readonly string[];
  readonly packageJson: PackageJson | null;
  readonly warnings: readonly string[];
}

/**
 * The single, immutable view of a repository that every rule reads from.
 *
 * Building this once — one walk, one read, one lex per file — is what keeps a
 * scan feeling like a linter rather than a build. Rules must never touch the
 * filesystem themselves; if a rule needs new derived data, it belongs here so
 * the cost is paid once and shared.
 */
export class ProjectIndex {
  readonly root: string;
  readonly profile: ProjectProfile;
  /** Every file that was read, in stable path order. */
  readonly files: readonly SourceFile[];
  readonly allPaths: readonly string[];
  readonly packageJson: PackageJson | null;
  readonly warnings: readonly string[];

  readonly #byPath: ReadonlyMap<string, SourceFile>;
  readonly #byRole: ReadonlyMap<FileRole, readonly SourceFile[]>;
  readonly #frameworks: ReadonlySet<FrameworkId>;
  readonly #pathSet: ReadonlySet<string>;
  readonly #dependencies: ReadonlySet<string>;

  constructor(init: ProjectIndexInit) {
    this.root = init.root;
    this.profile = init.profile;
    this.files = init.files;
    this.allPaths = init.allPaths;
    this.packageJson = init.packageJson;
    this.warnings = init.warnings;

    const byPath = new Map<string, SourceFile>();
    const byRole = new Map<FileRole, SourceFile[]>();
    for (const file of init.files) {
      byPath.set(file.path, file);
      const bucket = byRole.get(file.role);
      if (bucket === undefined) byRole.set(file.role, [file]);
      else bucket.push(file);
    }
    this.#byPath = byPath;
    this.#byRole = byRole;
    this.#frameworks = new Set(init.profile.frameworks.map((f) => f.id));
    this.#pathSet = new Set(init.allPaths);
    this.#dependencies = new Set([
      ...Object.keys(init.profile.dependencies),
      ...Object.keys(init.profile.devDependencies),
    ]);
  }

  /** All JavaScript/TypeScript source files. */
  get sourceFiles(): readonly SourceFile[] {
    return this.files.filter((f) => SOURCE_EXTENSIONS.includes(f.ext));
  }

  /** Look up a file by repository-relative POSIX path. */
  file(path: string): SourceFile | undefined {
    return this.#byPath.get(path);
  }

  /** True when the walker saw this path, whether or not it was read. */
  hasPath(path: string): boolean {
    return this.#pathSet.has(path);
  }

  /** Files with a given role, in path order. */
  withRole(...roles: readonly FileRole[]): readonly SourceFile[] {
    if (roles.length === 1) return this.#byRole.get(roles[0]!) ?? [];
    const out: SourceFile[] = [];
    for (const role of roles) out.push(...(this.#byRole.get(role) ?? []));
    out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
  }

  /** True when the named framework was detected. */
  hasFramework(...ids: readonly FrameworkId[]): boolean {
    return ids.some((id) => this.#frameworks.has(id));
  }

  /** True when the project declares the given dependency (runtime or dev). */
  hasDependency(...names: readonly string[]): boolean {
    return names.some((n) => this.#dependencies.has(n));
  }

  /** True when any declared dependency starts with `prefix`. */
  hasDependencyMatching(prefix: string): boolean {
    for (const name of this.#dependencies) {
      if (name.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Every declared dependency name. */
  get dependencyNames(): ReadonlySet<string> {
    return this.#dependencies;
  }

  /** All files whose path matches a predicate. */
  findFiles(predicate: (file: SourceFile) => boolean): readonly SourceFile[] {
    return this.files.filter(predicate);
  }

  /** All walked paths matching a predicate, including files that were not read. */
  findPaths(predicate: (path: string) => boolean): readonly string[] {
    return this.allPaths.filter(predicate);
  }

  /**
   * Server-side files: route handlers, server actions, middleware and plain
   * server modules. This is the population most auth and data-safety rules
   * reason about.
   */
  get serverFiles(): readonly SourceFile[] {
    return this.files.filter((f) => f.isServer);
  }

  /** HTTP entry points across both Next.js routers. */
  get routeFiles(): readonly SourceFile[] {
    return this.withRole('next-app-route', 'next-pages-api');
  }
}
