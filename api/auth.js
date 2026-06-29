// api/auth.js
// 流程（已優化為平行請求，減少等待時間）：
// 1. 前端傳入 Lark OAuth 授權碼 code
// 2. 同時取得 app_access_token 與 tenant_access_token（兩者互不依賴）
// 3. 同時進行：(a) 用 code 換 user_access_token 再取得使用者資訊 (b) 用 tenant_access_token 查白名單表格全部記錄
// 4. 比對使用者 open_id 是否在白名單裡
// 5. 回傳 { authorized: true/false, name }

async function getAppAccessToken() {
  const resp = await fetch('https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  })
  const data = await resp.json()
  if (data.code !== 0) throw new Error('app_access_token 取得失敗：' + data.msg)
  return data.app_access_token
}

async function getTenantAccessToken() {
  const resp = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  })
  const data = await resp.json()
  if (data.code !== 0) throw new Error('tenant_access_token 取得失敗：' + data.msg)
  return data.tenant_access_token
}

async function getUserIdentity(code, appAccessToken) {
  const userTokenResp = await fetch('https://open.larksuite.com/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + appAccessToken,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  })
  const userTokenData = await userTokenResp.json()
  if (userTokenData.code !== 0) throw new Error('user_access_token 取得失敗：' + userTokenData.msg)
  const userAccessToken = userTokenData.data.access_token

  const userInfoResp = await fetch('https://open.larksuite.com/open-apis/authen/v1/user_info', {
    headers: { Authorization: 'Bearer ' + userAccessToken },
  })
  const userInfoData = await userInfoResp.json()
  if (userInfoData.code !== 0) throw new Error('使用者資訊取得失敗：' + userInfoData.msg)
  return { openId: userInfoData.data.open_id, name: userInfoData.data.name }
}

async function getWhitelistItems(tenantAccessToken) {
  const WHITELIST_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'Aa8sb4SbwaWlLrsZJl9jhGTSpGu'
  const WHITELIST_TABLE_ID = 'tblboTrr6gAYWLlR'
  const listResp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${WHITELIST_APP_TOKEN}/tables/${WHITELIST_TABLE_ID}/records?page_size=200`,
    { headers: { Authorization: 'Bearer ' + tenantAccessToken } }
  )
  const listData = await listResp.json()
  if (listData.code !== 0) throw new Error('白名單查詢失敗：' + listData.msg)
  return listData.data.items || []
}

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

    // 第一輪：app_access_token、tenant_access_token 互不依賴，平行取得
    const [appAccessToken, tenantAccessToken] = await Promise.all([
      getAppAccessToken(),
      getTenantAccessToken(),
    ])

    // 第二輪：使用者身份查詢、白名單查詢也互不依賴，平行進行
    const [identity, whitelistItems] = await Promise.all([
      getUserIdentity(code, appAccessToken),
      getWhitelistItems(tenantAccessToken),
    ])

    const authorized = whitelistItems.some((item) => {
      const account = item.fields['帳號']
      if (!account) return false
      // 「人員」欄位回傳格式通常是陣列 [{ id: 'ou_xxx', name: '...' }]
      if (Array.isArray(account)) {
        return account.some((p) => p.id === identity.openId)
      }
      return account.id === identity.openId
    })

    res.status(200).json({ authorized, name: identity.name, open_id: identity.openId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
