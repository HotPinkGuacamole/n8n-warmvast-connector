module.exports = {
	root: true,
	parser: 'jsonc-eslint-parser',
	plugins: ['eslint-plugin-n8n-nodes-base'],
	extends: ['plugin:n8n-nodes-base/community'],
	rules: {
		'n8n-nodes-base/community-package-json-name-still-default': 'off',
	},
};
