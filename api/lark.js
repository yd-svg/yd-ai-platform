// api/lark.js
// 代理所有對 Lark open-apis 的請求，避免瀏覽器直接呼叫造成的 CORS 問題

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    // 前端會帶上 ?path=/bitable/v1/apps/xxx/tables/xxx/records 這種參數
    const { path } = req.query
    if (!path) {
      res.status(400).json({ error: 'Missing path param' })
      return
    }

    const targetUrl = 'https://open.larksuite.com/open-apis' + path

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers['authorization'] || '',
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
