// 一次取得專案管理所需資料（server 端並行 + 單次 token）

const APP_TOKEN = process.env.LARK_APP_TOKEN || 'Ush0bCKtAa08h7slpVVjqG10pIg'
const TABLES = {
  projects: process.env.LARK_TABLE_PROJECTS || 'tblQx7UphBLyz4K7',
  tasks: process.env.LARK_TABLE_TASKS || 'tbl1RelJ3o5lr79D',
  acceptance: process.env.LARK_TABLE_ACCEPTANCE || 'tblOaBLFAhOy7qXC',
}

async function getToken() {
  const res = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(data.msg || 'Token error')
  return data.tenant_access_token
}

async function listTable(token, tableId, pageSize) {
  const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records?page_size=${pageSize}`
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(data.msg || 'Lark API error')
  return data.data?.items || []
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const token = await getToken()
    const [projects, tasks, acceptance] = await Promise.all([
      listTable(token, TABLES.projects, 100),
      listTable(token, TABLES.tasks, 500),
      listTable(token, TABLES.acceptance, 500),
    ])
    res.status(200).json({ ok: true, ts: Date.now(), projects, tasks, acceptance })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
