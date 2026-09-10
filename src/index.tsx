import { Hono } from 'hono'
import { renderer } from './renderer'
import api from './routes/api'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)
app.route('/api', api)

app.get('/', (c) => {
  return c.render(<div id="app"></div>)
})

export default app
