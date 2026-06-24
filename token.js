// api/token.js
// appSecret 安全地存在 Vercel 環境變數，不會暴露在前端

export default async function handler(req, res) {
  // 允許跨域
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const response = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    })

    const data = await response.json()

    if (data.code !== 0) {
      res.status(400).json({ error: data.msg })
      return
    }

    res.status(200).json({
      token: data.tenant_access_token,
      expire: data.expire,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
