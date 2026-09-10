import { Hono } from 'hono'
import { renderer } from './renderer'
import api from './routes/api'
import scrapeRoutes from './routes/scrape'

type Bindings = {
  DB: D1Database
  GITHUB_TOKEN?: string
  GITHUB_REPO?: string
  IMPORT_TOKEN?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)
app.route('/api', api)
app.route('/api/scrape', scrapeRoutes)

app.get('/', (c) => {
  return c.render(<div id="app"></div>)
})

export default app
