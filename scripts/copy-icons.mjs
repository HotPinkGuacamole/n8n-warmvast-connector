import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const targets = [
	['nodes/Teamleader/teamleader.svg', 'dist/nodes/Teamleader/teamleader.svg'],
];

for (const [from, to] of targets) {
	if (!existsSync(from)) continue;
	await mkdir(to.substring(0, to.lastIndexOf('/')), { recursive: true });
	await cp(from, to);
}

console.log('Icons copied.');
