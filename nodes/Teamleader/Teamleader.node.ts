import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';

import { TeamleaderV1 } from './v1/TeamleaderV1';
import { TeamleaderV2 } from './v2/TeamleaderV2';

export class Teamleader extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'Teamleader',
			name: 'teamleader',
			icon: 'file:teamleader.svg',
			group: ['transform'],
			description: 'Work with the Teamleader Focus API',
			defaultVersion: 2,
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new TeamleaderV1(baseDescription),
			2: new TeamleaderV2(baseDescription),
		};

		super(nodeVersions, baseDescription);
	}
}
