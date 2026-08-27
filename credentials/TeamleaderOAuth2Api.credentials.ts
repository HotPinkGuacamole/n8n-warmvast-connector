import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Teamleader Focus OAuth2 (authorization code grant).
 *
 * Register an integration on https://marketplace.focus.teamleader.eu/build
 * and add the n8n OAuth callback URL as an allowed redirect URI.
 */
export class TeamleaderOAuth2Api implements ICredentialType {
	name = 'teamleaderOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Teamleader OAuth2 API';

	documentationUrl = 'https://developer.focus.teamleader.eu/';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			// Teamleader requires client_id and client_secret in the POST body
			// of the token exchange, not in an Authorization header.
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'string',
			default: 'https://focus.teamleader.eu/oauth2/authorize',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'string',
			default: 'https://focus.teamleader.eu/oauth2/access_token',
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: '',
			description:
				'Space separated list of scopes. Leave empty to use the scopes configured on the Teamleader integration itself.',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.focus.teamleader.eu',
			description: 'Base URL of the Teamleader Focus API',
		},
	];
}
