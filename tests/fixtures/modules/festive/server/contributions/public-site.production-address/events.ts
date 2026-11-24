import { festive } from '../../state'

export default { base: '/events/', appliesWhen: async () => festive.on }
