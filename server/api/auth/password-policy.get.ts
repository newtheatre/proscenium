// The password rules the server will enforce, so a form cannot hint at a rule that has moved.
export default defineEventHandler(async event => passwordPolicy(event))
