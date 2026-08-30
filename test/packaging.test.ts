import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { VersionedNodeType } from 'n8n-workflow';

import { Teamleader } from '../nodes/Teamleader/Teamleader.node';
import { TeamleaderV1 } from '../nodes/Teamleader/v1/TeamleaderV1';
import { TeamleaderV2 } from '../nodes/Teamleader/v2/TeamleaderV2';

/**
 * Deployment contract for `N8N_CUSTOM_EXTENSIONS`.
 *
 * n8n's custom-directory loader discovers node entrypoints by globbing
 * `**\/*.node.js` on disk — it does NOT read the `n8n` block of package.json to
 * decide what is public. Every file matching that pattern is therefore
 * instantiated as a standalone node type, with no constructor arguments.
 *
 * `TeamleaderV1`/`TeamleaderV2` are internal implementations of one versioned
 * node: they require a `baseDescription` and are only ever constructed by the
 * `Teamleader` wrapper. Naming their files `*.node.ts` made the loader pick
 * them up as nodes of their own, construct them with no argument and end up
 * with `description.name === undefined` — which broke the load of the whole
 * custom directory, so neither Teamleader nor Teamleader Trigger appeared in
 * the editor.
 *
 * The fix is structural: only real entrypoints may be called `*.node.ts`.
 * These tests protect that, because nothing else in the build does.
 */

const repoRoot = join(__dirname, '..');

/** Every file under `directory`, as repo-relative POSIX paths. */
function walk(directory: string): string[] {
	const found: string[] = [];

	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = join(directory, entry.name);
		if (entry.isDirectory()) {
			found.push(...walk(absolute));
		} else {
			found.push(relative(repoRoot, absolute).split(sep).join('/'));
		}
	}

	return found.sort();
}

const nodeEntrypoints = (files: string[]) => files.filter((file) => /\.node\.(ts|js)$/.test(file));

describe('n8n node entrypoint discovery', () => {
	const sourceFiles = walk(join(repoRoot, 'nodes'));

	it('exposes exactly the two public entrypoints as *.node.ts', () => {
		expect(nodeEntrypoints(sourceFiles)).toEqual([
			'nodes/Teamleader/Teamleader.node.ts',
			'nodes/Teamleader/TeamleaderTrigger.node.ts',
		]);
	});

	it('keeps the internal version implementations out of the entrypoint pattern', () => {
		// They exist...
		expect(sourceFiles).toContain('nodes/Teamleader/v1/TeamleaderV1.ts');
		expect(sourceFiles).toContain('nodes/Teamleader/v2/TeamleaderV2.ts');
		// ...but the loader must never see them as nodes of their own.
		expect(sourceFiles).not.toContain('nodes/Teamleader/v1/TeamleaderV1.node.ts');
		expect(sourceFiles).not.toContain('nodes/Teamleader/v2/TeamleaderV2.node.ts');
	});

	it('never lets a version implementation be constructed as a standalone node', () => {
		// This is what the loader does to anything it discovers. Both classes
		// require the wrapper's base description, which is exactly why their
		// files must not be discoverable.
		for (const Implementation of [TeamleaderV1, TeamleaderV2]) {
			const constructWithoutBaseDescription = Implementation as unknown as new () => {
				description: { name?: string };
			};
			expect(new constructWithoutBaseDescription().description.name).toBeUndefined();
		}
	});

	it('lists only those entrypoints in the package manifest', () => {
		const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
			n8n: { nodes: string[]; credentials: string[] };
		};

		expect(manifest.n8n.nodes).toEqual([
			'dist/nodes/Teamleader/Teamleader.node.js',
			'dist/nodes/Teamleader/TeamleaderTrigger.node.js',
		]);

		// Each manifest entry must correspond to a real source entrypoint, so the
		// two discovery mechanisms (manifest and directory glob) cannot disagree.
		for (const entry of manifest.n8n.nodes) {
			const source = entry.replace(/^dist\//, '').replace(/\.js$/, '.ts');
			expect(sourceFiles).toContain(source);
		}
	});
});

describe('compiled output', () => {
	const distNodes = join(repoRoot, 'dist', 'nodes');
	// `npm test` may run on a clean checkout; the quality gate builds first.
	const built = existsSync(distNodes);

	(built ? it : it.skip)('ships exactly two *.node.js files', () => {
		expect(nodeEntrypoints(walk(distNodes))).toEqual([
			'dist/nodes/Teamleader/Teamleader.node.js',
			'dist/nodes/Teamleader/TeamleaderTrigger.node.js',
		]);
	});

	(built ? it : it.skip)('still compiles the implementations as ordinary modules', () => {
		const files = walk(distNodes);
		expect(files).toContain('dist/nodes/Teamleader/v1/TeamleaderV1.js');
		expect(files).toContain('dist/nodes/Teamleader/v2/TeamleaderV2.js');
	});
});

describe('the wrapper still owns both versions', () => {
	const node = new Teamleader();

	it('is a VersionedNodeType mapping 1 to V1 and 2 to V2, defaulting to 2', () => {
		expect(node).toBeInstanceOf(VersionedNodeType);
		expect(node.nodeVersions[1]).toBeInstanceOf(TeamleaderV1);
		expect(node.nodeVersions[2]).toBeInstanceOf(TeamleaderV2);
		expect(Object.keys(node.nodeVersions).sort()).toEqual(['1', '2']);
		expect(node.description.defaultVersion).toBe(2);
	});

	it('gives every version the single public node name', () => {
		expect(node.description.name).toBe('teamleader');
		expect(node.getNodeType(1).description.name).toBe('teamleader');
		expect(node.getNodeType(2).description.name).toBe('teamleader');
	});
});
