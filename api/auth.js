// api/auth.js
// 流程：
// 1. 前端傳入 Lark OAuth 授權碼 code
// 2. 用 code + app_access_token 換 user_access_token
// 3. 用 user_access_token 取得使用者資訊（open_id）
// 4. 拿 open_id 去查「人員列表」白名單表格的「帳號」欄位是否有對應的人
// 5. 回傳 { authorized: true/false, name }

export default async function handler(req, res) {
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
    const { code } = req.body || {}
    if (!code) {
      res.status(400).json({ error: 'Missing code' })
      return
    }

    // 1. 取得 app_access_token（用 app_id + app_secret 換）
    const appTokenResp = await fetch('https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    })
    const appTokenData = await appTokenResp.json()
    if (appTokenData.code !== 0) {
      res.status(400).json({ error: 'app_access_token 取得失敗：' + appTokenData.msg })
      return
    }
    const appAccessToken = appTokenData.app_access_token

    // 2. 用 code 換 user_access_token
    const userTokenResp = await fetch('https://open.larksuite.com/open-apis/authen/v1/oidc/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + appAccessToken,
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code }),
    })
    const userTokenData = await userTokenResp.json()
    if (userTokenData.code !== 0) {
      res.status(400).json({ error: 'user_access_token 取得失敗：' + userTokenData.msg })
      return
    }
    const userAccessToken = userTokenData.data.access_token

    // 3. 取得使用者資訊
    const userInfoResp = await fetch('https://open.larksuite.com/open-apis/authen/v1/user_info', {
      headers: { Authorization: 'Bearer ' + userAccessToken },
    })
    const userInfoData = await userInfoResp.json()
    if (userInfoData.code !== 0) {
      res.status(400).json({ error: '使用者資訊取得失敗：' + userInfoData.msg })
      return
    }
    const userOpenId = userInfoData.data.open_id
    const userName = userInfoData.data.name

    // 4. 取得 tenant_access_token，去查白名單表格
    const tenantTokenResp = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    })
    const tenantTokenData = await tenantTokenResp.json()
    const tenantAccessToken = tenantTokenData.tenant_access_token

    // 5. 查白名單表格（人員列表），page_size 拉大一點確保涵蓋全部白名單
    const WHITELIST_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'Ush0bCKtAa08h7slpVVjqG10pIg'
    const WHITELIST_TABLE_ID = 'tblH0xy9KqUQzoWg'
    const listResp = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${WHITELIST_APP_TOKEN}/tables/${WHITELIST_TABLE_ID}/records?page_size=200`,
      { headers: { Authorization: 'Bearer ' + tenantAccessToken } }
    )
    const listData = await listResp.json()
    if (listData.code !== 0) {
      res.status(400).json({ error: '白名單查詢失敗：' + listData.msg })
      return
    }

    const items = listData.data.items || []
    const authorized = items.some((item) => {
      const account = item.fields['帳號']
      if (!account) return false
      // 「人員」欄位回傳格式通常是陣列 [{ id: 'ou_xxx', name: '...' }]
      if (Array.isArray(account)) {
        return account.some((p) => p.id === userOpenId)
      }
      return account.id === userOpenId
    })

    res.status(200).json({ authorized, name: userName, open_id: userOpenId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
