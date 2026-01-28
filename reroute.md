# ALB Samauth work flow 1
## Hosting discovery
- URL
```
https://katyms27-moos.testplmcloudsolutions.com/hosting/discovery
```
- params
| Name | Value |
|------|-------|
| *(none)* | — |
- purpose
Entry point for discovery behind the ALB (katyms27-moos.testplmcloudsolutions.com); used to locate available services or tenant configuration. There is no app backend at this host—auth is backed by SAM (samauth).

---

## SAM auth (initiate)
- URL
```
https://samauth.us-east-1.sws.siemens.com/auth?client_id=A-Bu4lNXOeq5ZeQ45Xt8-&redirect_uri=https%3A%2F%2Fkatyms27-moos.testplmcloudsolutions.com%2Foauth2%2Fidpresponse&response_type=code&scope=openid%2Bsam_account%2Bsamauth.ten%2Bemail%2Bprofile&state=6dWk1%2B63HR0nLzGrWh2WsM%2BITe3KwF%2BMpQQ7wBrvOEEDlIwgNEDefBBQa58XRPbPHWyUPvPhDc6E7eC9F5LfjsmqRB5axENNGg4tzYPK5qJdM4FIoZ1LSlOqIALxPfl9u%2FDK2PR2yM0W2LuJ0RmZergzTaAruaSj%2BFYyxq1VZQ6iXsKnoPHfRaXmYCTOGFf25FF5%2FV3VVNYoa7RQd%2FAWtvGgupYslgbXpgAIQLba0HyrSRih9TlejZO71%2Bi1Ud5VLdJMBJ6UUQ%3D%3D&prompt=login+consent&display=page
```
- params
| Name | Value |
|------|-------|
| client_id | A-Bu4lNXOeq5ZeQ45Xt8- |
| redirect_uri | https://katyms27-moos.testplmcloudsolutions.com/oauth2/idpresponse |
| response_type | code |
| scope | openid+sam_account+samauth.ten+email+profile |
| state | (opaque state token) |
| prompt | login consent |
| display | page |
- purpose
Starts the Siemens SAM OAuth flow: redirects user to login/consent with PKCE-style state and requested scopes; callback goes to the ALB at `/oauth2/idpresponse` (auth is backed by SAM).

---

## SAM interaction
- URL
```
https://samauth.us-east-1.sws.siemens.com/interaction
```
- params
| Name | Value |
|------|-------|
| *(none)* | — |
- purpose
SAM interaction UI; user chooses or completes identity/tenant (e.g. MyID vs employee login) before being sent to the actual IdP.

---

## DISW login authorize (first)
- URL
```
https://diswlogin.siemens.com/authorize?client_id=kCp4RhRFcQyX2iMhZIGWQdIzeVdWrbVe&scope=openid%20email%20profile&response_type=code&redirect_uri=https%3A%2F%2Fsamauth.us-east-1.sws.siemens.com%2Finteraction%2Fcallback&state=AgMTT90iizwJdisInAnN16rfPvNENh3VYnHy1XHSYNA&myid=true&hideEmplLogin=true&login_hint=wenjia.peng%40siemens.com&code_challenge=lwNSw_0x6uBgDrGtz2XuSezqZwfql4WiXWnDTSPJYj8&code_challenge_method=S256
```
- params
| Name | Value |
|------|-------|
| client_id | kCp4RhRFcQyX2iMhZIGWQdIzeVdWrbVe |
| scope | openid email profile |
| response_type | code |
| redirect_uri | https://samauth.us-east-1.sws.siemens.com/interaction/callback |
| state | AgMTT90iizwJdisInAnN16rfPvNENh3VYnHy1XHSYNA |
| myid | true |
| hideEmplLogin | true |
| login_hint | wenjia.peng@siemens.com |
| code_challenge | lwNSw_0x6uBgDrGtz2XuSezqZwfql4WiXWnDTSPJYj8 |
| code_challenge_method | S256 |
- purpose
DISW login (MyID) authorize request: PKCE, login_hint for pre-filled email, and callback back to SAM interaction; employee login can be hidden.

---

## DISW login page
- URL
```
https://diswlogin.siemens.com/login?state=hKFo2SBxOEZ0VW9kMVRIZHNpbmR6dldBNEZLSG4ybGtfX2pWUKFupWxvZ2luo3RpZNkgTzByM0hGeUFhbnR3MWVSdGViNkFSWVViUWZWV21SS0ejY2lk2SBrQ3A0UmhSRmNReVgyaU1oWklHV1FkSXplVmRXcmJWZQ&client=kCp4RhRFcQyX2iMhZIGWQdIzeVdWrbVe&protocol=oauth2&scope=openid%20email%20profile&response_type=code&redirect_uri=https%3A%2F%2Fsamauth.us-east-1.sws.siemens.com%2Finteraction%2Fcallback&myid=true&hideEmplLogin=true&login_hint=wenjia.peng%40siemens.com&code_challenge=lwNSw_0x6uBgDrGtz2XuSezqZwfql4WiXWnDTSPJYj8&code_challenge_method=S256
```
- params
| Name | Value |
|------|-------|
| state | (JWT-like state from DISW) |
| client | kCp4RhRFcQyX2iMhZIGWQdIzeVdWrbVe |
| protocol | oauth2 |
| scope | openid email profile |
| response_type | code |
| redirect_uri | https://samauth.us-east-1.sws.siemens.com/interaction/callback |
| myid | true |
| hideEmplLogin | true |
| login_hint | wenjia.peng@siemens.com |
| code_challenge | lwNSw_0x6uBgDrGtz2XuSezqZwfql4WiXWnDTSPJYj8 |
| code_challenge_method | S256 |
- purpose
DISW login UI: user enters credentials (or uses MyID); same PKCE and callback as authorize; state carries session/flow info.

---

## DISW authorize (connection)
- URL
```
https://diswlogin.siemens.com/authorize?connection=main-tenant-oidc&state=hKFo2SBxOEZ0VW9kMVRIZHNpbmR6dldBNEZLSG4ybGtfX2pWUKFupWxvZ2luo3RpZNkgTzByM0hGeUFhbnR3MWVSdGViNkFSWVViUWZWV21SS0ejY2lk2SBrQ3A0UmhSRmNReVgyaU1oWklHV1FkSXplVmRXcmJWZQ
```
- params
| Name | Value |
|------|-------|
| connection | main-tenant-oidc |
| state | (same JWT-like state) |
- purpose
Continues DISW flow using the chosen connection (main-tenant-oidc); typically redirects to the underlying IdP (e.g. login.siemens.com) with state preserved.

---

## login.siemens.com authorize
- URL
```
https://login.siemens.com/authorize?login_hint=wenjia.peng%40siemens.com&response_type=code&redirect_uri=https%3A%2F%2Fdiswlogin.siemens.com%2Flogin%2Fcallback&scope=email%20profile%20openid&state=TDppdjYj5yhR9hVFf4mQKK5cQp7leT3j&client_id=qLSArYYHFmsyhzkfGK5RD8Or2Lqsz9tg
```
- params
| Name | Value |
|------|-------|
| login_hint | wenjia.peng@siemens.com |
| response_type | code |
| redirect_uri | https://diswlogin.siemens.com/login/callback |
| scope | email profile openid |
| state | TDppdjYj5yhR9hVFf4mQKK5cQp7leT3j |
| client_id | qLSArYYHFmsyhzkfGK5RD8Or2Lqsz9tg |
- purpose
Siemens corporate IdP authorize: user signs in at login.siemens.com; after success, browser is sent to DISW `/login/callback` with an auth code and state.

---

## DISW login callback
- URL
```
https://diswlogin.siemens.com/login/callback?code=bTO46VcfrcEQjPH7RMpSEQVLuC9IiXR5Dz6AeZfGVcvzA&state=TDppdjYj5yhR9hVFf4mQKK5cQp7leT3j
```
- params
| Name | Value |
|------|-------|
| code | bTO46VcfrcEQjPH7RMpSEQVLuC9IiXR5Dz6AeZfGVcvzA |
| state | TDppdjYj5yhR9hVFf4mQKK5cQp7leT3j |
- purpose
Callback from login.siemens.com: DISW exchanges the code for tokens, validates state, then continues the flow (e.g. to authorize/resume).

---

## DISW authorize resume
- URL
```
https://diswlogin.siemens.com/authorize/resume?state=O0r3HFyAantw1eRteb6ARYUbQfVWmRKG
```
- params
| Name | Value |
|------|-------|
| state | O0r3HFyAantw1eRteb6ARYUbQfVWmRKG |
- purpose
Resumes the DISW authorize flow after login/callback; completes the DISW leg and redirects back to SAM interaction with a code.

---

## SAM interaction callback
- URL
```
https://samauth.us-east-1.sws.siemens.com/interaction/callback?code=X6B-E1F3xJNkEMTa0ZlEeAF9HkOwc_rpemJuBDRYNLWaB&state=AgMTT90iizwJdisInAnN16rfPvNENh3VYnHy1XHSYNA
```
- params
| Name | Value |
|------|-------|
| code | X6B-E1F3xJNkEMTa0ZlEeAF9HkOwc_rpemJuBDRYNLWaB |
| state | AgMTT90iizwJdisInAnN16rfPvNENh3VYnHy1XHSYNA |
- purpose
Callback from DISW to SAM: SAM exchanges the code for tokens, binds the session to the original `/auth` state, then redirects to the next step (e.g. SAM `/auth/<id>`).

---

## SAM auth (session/token)
- URL
```
https://samauth.us-east-1.sws.siemens.com/auth/r5RnckDrwyJixRWlvXL3m
```
- params
| Name | Value |
|------|-------|
| *(path)* | r5RnckDrwyJixRWlvXL3m (session or token id) |
- purpose
SAM auth session or token endpoint: finalizes the SAM side of the flow (e.g. issue cookies or redirect to the ALB’s `redirect_uri` with code or error params; auth at that host is backed by SAM).

---

## ALB OAuth2 IdP response (error)
- URL
```
https://katyms27-moos.testplmcloudsolutions.com/oauth2/idpresponse?error=access_denied&state=6dWk1%2B63HR0nLzGrWh2WsM%2BITe3KwF%2BMpQQ7wBrvOEEDlIwgNEDefBBQa58XRPbPHWyUPvPhDc6E7eC9F5LfjsmqRB5axENNGg4tzYPK5qJdM4FIoZ1LSlOqIALxPfl9u%2FDK2PR2yM0W2LuJ0RmZergzTaAruaSj%2BFYyxq1VZQ6iXsKnoPHfRaXmYCTOGFf25FF5%2FV3VVNYoa7RQd%2FAWtvGgupYslgbXpgAIQLba0HyrSRih9TlejZO71%2Bi1Ud5VLdJMBJ6UUQ%3D%3D&iss=https%3A%2F%2Fsamauth.us-east-1.sws.siemens.com%2F
```
- params
| Name | Value |
|------|-------|
| error | access_denied |
| state | (same state as original /auth request) |
| iss | https://samauth.us-east-1.sws.siemens.com/ |
- purpose
OAuth2 callback to the ALB when the IdP/SAM flow fails or user denies consent: conveys `access_denied` and issuer. The request hits the ALB; the auth path (SAM-backed) returns 401—no app backend at this host.

- analysis (flow 1)
**Scope:** `openid+sam_account+samauth.ten+email+profile` (documented above). SAM has no permission setup for `sam_account` and `samauth.ten`, so those scopes are not available. **Reducing scope to `openid+email+profile` only (dropping sam_account and samauth.ten) still yields 401 access_denied.** So the cause is not only “missing sam_account/samauth.ten”—something else in the full flow (SAM → interaction → DISW → login.siemens.com) is failing, e.g. client not allowed to request email/profile, consent or prompt behavior, or a failure in DISW/login.siemens.com. Same use case as flow 2; flow 1 goes through the full IdP chain and still ends in 401 even with minimal scope.


# ALB Samauth work flow 2
## Hosting discovery
- URL
```
https://katyms27-moos.testplmcloudsolutions.com/hosting/discovery
```
- params
| Name | Value |
|------|-------|
| *(none)* | — |
- purpose
Entry point for discovery behind the ALB; same as flow 1—no app backend; auth is backed by SAM.

---

## SAM auth (initiate)
- URL
```
https://samauth.us-east-1.sws.siemens.com/auth?client_id=A-Bu4lNXOeq5ZeQ45Xt8-&redirect_uri=https%3A%2F%2Fkatyms27-moos.testplmcloudsolutions.com%2Foauth2%2Fidpresponse&response_type=code&scope=openid&state=Pri0GZWaP0b6U2kcSkZ993u4JHrOU0jLZwDcvgeH1SSICVSqFiBOWdbaiKGO%2Fbz4f25wHT6QMh0YB8mqLwIsBXMFVCBJQqJ0mL34QIE5CTjuaPiq%2BGiiekN2Xl5cwhZUZrDY9bgKsN6o2xvuOfdD9L44p2e8Ob8tvNn56rgHYx%2Fc1txULn1AZBnA4rUNvU8ay0Z%2F3PlD2N1AiXJS%2BkrLX0Wx0rvl7Aspxl93CuEjgGGhyCFe0dKD38gDcAFGu49K3xW3oAAumw%3D%3D
```
- params
| Name | Value |
|------|-------|
| client_id | A-Bu4lNXOeq5ZeQ45Xt8- |
| redirect_uri | https://katyms27-moos.testplmcloudsolutions.com/oauth2/idpresponse |
| response_type | code |
| scope | openid |
| state | (opaque state token) |
- purpose
Starts the Siemens SAM OAuth flow with minimal scope (openid only). No prompt/display params—likely reusing existing session or skipping consent; callback goes to the ALB at `/oauth2/idpresponse` (auth backed by SAM).

---

## ALB OAuth2 IdP response (returns 500)
- URL
```
https://katyms27-moos.testplmcloudsolutions.com/oauth2/idpresponse?code=c91A6145oMCJmwbQqefbDB5cCO5kB_HguG0MI8Mjc2f&state=Pri0GZWaP0b6U2kcSkZ993u4JHrOU0jLZwDcvgeH1SSICVSqFiBOWdbaiKGO%2Fbz4f25wHT6QMh0YB8mqLwIsBXMFVCBJQqJ0mL34QIE5CTjuaPiq%2BGiiekN2Xl5cwhZUZrDY9bgKsN6o2xvuOfdD9L44p2e8Ob8tvNn56rgHYx%2Fc1txULn1AZBnA4rUNvU8ay0Z%2F3PlD2N1AiXJS%2BkrLX0Wx0rvl7Aspxl93CuEjgGGhyCFe0dKD38gDcAFGu49K3xW3oAAumw%3D%3D&iss=https%3A%2F%2Fsamauth.us-east-1.sws.siemens.com%2F
```
- params
| Name | Value |
|------|-------|
| code | c91A6145oMCJmwbQqefbDB5cCO5kB_HguG0MI8Mjc2f |
| state | (same state as original /auth request) |
| iss | https://samauth.us-east-1.sws.siemens.com/ |
- purpose
OAuth2 callback to the ALB with success: SAM redirected with an authorization code and matching state. The request hits the ALB; the auth path (SAM-backed) handles the callback. There is no app backend—auth is backed by SAM. No DISW/login.siemens.com in this flow (e.g. existing SAM session).

- analysis (flow 2)
**Scope:** `openid` only (no `sam_account` or `samauth.ten`). Same use case as flow 1. SAM can grant this and redirects to the ALB with a code. **Why 500:** The failure happens after the redirect, when the SAM-backed auth path processes the code (token exchange, session creation, or downstream). A 500 indicates a server-side error there or in SAM—e.g. the path may expect claims/scopes that were not requested (only `openid`), or a bug when minimal scope is used. Check ALB target and SAM logs for the exact error.