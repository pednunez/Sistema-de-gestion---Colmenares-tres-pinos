import asyncio
import json
import unittest
from unittest.mock import patch
import test_password_recovery as recovery
from app.main import app
from app.database import settings

async def call(path, data=None, cookie=None, csrf=None, origin=None, bearer=None, method=None):
    messages=[]
    headers=[(b'content-type',b'application/json')]
    for key,value in [('cookie',cookie),('x-csrf-token',csrf),('origin',origin),('authorization',('Bearer '+bearer) if bearer else None)]:
        if value is not None: headers.append((key.encode(),value.encode()))
    body=json.dumps(data).encode() if data is not None else b''
    scope=dict(type='http',asgi={'version':'3.0'},http_version='1.1',method=method or ('POST' if data is not None else 'GET'),scheme='https',path=path,raw_path=path.encode(),query_string=b'',root_path='',headers=headers,client=('127.0.0.1',1234),server=('test',443))
    async def receive(): return {'type':'http.request','body':body,'more_body':False}
    async def send(message): messages.append(message)
    await app(scope,receive,send)
    start=next(m for m in messages if m['type']=='http.response.start')
    payload=b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body')
    return start['status'],json.loads(payload),[(k.decode(),v.decode()) for k,v in start['headers']]

class CookieTests(unittest.TestCase):
    setUp=recovery.RecoveryTests.setUp
    restore_overrides=recovery.RecoveryTests.restore_overrides
    def request(self,*a,**kw): return asyncio.run(call(*a,**kw))
    def login(self,**kw):
        status,body,headers=self.request('/auth/login',{'email':self.user.email,'password':self.old_password},**kw)
        self.assertEqual(status,200)
        cookie=next(v for k,v in headers if k=='set-cookie')
        return cookie.split(';')[0],body,headers
    def test_login_cookie_flags_and_no_token_in_body(self):
        with patch.object(settings,'SESSION_COOKIE_SECURE',True): cookie,body,headers=self.login()
        value=next(v for k,v in headers if k=='set-cookie')
        for flag in ['HttpOnly','Secure','SameSite=lax','Path=/','Max-Age=']: self.assertIn(flag,value)
        self.assertNotIn('access_token',body)
        self.assertNotIn(cookie.split('=',1)[1],json.dumps(body))
        self.assertEqual(body['usuario']['id'],self.user.id)
        self.assertEqual(self.request('/auth/me',cookie=cookie)[0],200)
        self.assertEqual(self.request('/auth/csrf',cookie=cookie)[1]['csrf_token'],body['csrf_token'])
    def test_logout_revokes_replay_and_all_sessions(self):
        a,body,_=self.login(); b,_,_=self.login()
        status,_,headers=self.request('/auth/logout',{},cookie=a,csrf=body['csrf_token'])
        self.assertEqual(status,200)
        self.assertIn('Max-Age=0',next(v for k,v in headers if k=='set-cookie'))
        for cookie in [a,b]: self.assertEqual(self.request('/auth/me',cookie=cookie)[0],401)
        fresh,_,_=self.login();self.assertEqual(self.request('/auth/me',cookie=fresh)[0],200)
    def test_csrf_required_and_bound_to_session(self):
        a,body,_=self.login();b,other,_=self.login()
        for csrf in [None,'wrong',other['csrf_token']]:
            self.assertEqual(self.request('/auth/logout',{},cookie=a,csrf=csrf)[0],403)
        self.assertEqual(self.request('/auth/me',cookie=a)[0],200)
        self.assertEqual(self.request('/auth/logout',{},cookie=a,csrf=body['csrf_token'])[0],200)
    def test_untrusted_origin_and_allowed_origin(self):
        self.assertEqual(self.request('/auth/login',{'email':self.user.email,'password':self.old_password},origin='https://evil.invalid')[0],403)
        cookie,body,_=self.login(origin='http://localhost:5173')
        self.assertEqual(self.request('/auth/logout',{},cookie=cookie,csrf=body['csrf_token'],origin='https://evil.invalid')[0],403)
    def test_reset_revokes_previous_cookie(self):
        cookie,_,_=self.login()
        self.request('/auth/recuperar-password',{'email':self.user.email})
        token=self.mail.call_args.kwargs['token']
        self.assertEqual(self.request('/auth/restablecer-password',{'token':token,'nueva_password':self.new_password,'confirmar_password':self.new_password})[0],200)
        self.assertEqual(self.request('/auth/me',cookie=cookie)[0],401)
    def test_inactive_missing_and_malformed_cookie(self):
        for cookie in [None,'colmenares_session=invalid']:
            self.assertEqual(self.request('/auth/me',cookie=cookie)[0],401)
        cookie,_,_=self.login();self.user.activo=False;self.db.commit()
        self.assertEqual(self.request('/auth/me',cookie=cookie)[0],401)
    def test_cookie_cannot_bypass_csrf_with_bearer_header(self):
        cookie,_,_=self.login()
        self.assertEqual(self.request('/auth/logout',{},cookie=cookie,bearer=cookie.split('=',1)[1])[0],403)

    def test_expired_and_legacy_cookie_rejected(self):
        from datetime import datetime, timedelta, timezone
        import jwt
        cookie,_,_=self.login()
        payload=jwt.decode(cookie.split('=',1)[1],settings.JWT_SECRET_KEY,algorithms=[settings.JWT_ALGORITHM])
        for change in ['expired','legacy']:
            altered=dict(payload)
            if change=='expired': altered['exp']=datetime.now(timezone.utc)-timedelta(seconds=1)
            else: altered.pop('ver')
            token=jwt.encode(altered,settings.JWT_SECRET_KEY,algorithm=settings.JWT_ALGORITHM)
            self.assertEqual(self.request('/auth/me',cookie=settings.SESSION_COOKIE_NAME+'='+token)[0],401)
