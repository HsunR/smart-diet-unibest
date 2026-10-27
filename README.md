# SmartDiet · unibest

SmartDiet 已从原生微信小程序迁移为 unibest（uni-app + Vue 3 + TypeScript），并保留 FastAPI 后端。前端支持 H5 与微信小程序，业务接口、Pinia 状态、UnoCSS/SCSS 样式和自定义 tabbar 均按 unibest 目录约定组织。

## 目录

```text
src/
  api/              # SmartDiet API 与类型
  pages/            # 登录、引导、饮食记录、报告、个人资料
  store/            # token、用户资料、饮食记录草稿
  tabbar/           # unibest 自定义 tabbar
  utils/            # 日期、餐次、营养目标等工具
backend/            # FastAPI、SQLAlchemy、Alembic、测试和 Docker
env/                # 前端分环境配置
```

## 本地运行

要求 Node.js 20+、pnpm 9+、Python 3.12+。首次安装：

```bash
pnpm install
```

启动后端：

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

启动前端：

```bash
pnpm dev:h5       # H5，默认 http://localhost:9000
pnpm dev:mp       # 微信小程序
```

微信开发者工具导入开发构建目录 `dist/dev/mp-weixin`。生产构建使用 `pnpm build:h5` 或 `pnpm build:mp`。

## 配置

- 前端 API 地址：`env/.env` 的 `VITE_SERVER_BASEURL`。微信真机不能访问电脑的 `127.0.0.1`，需改成局域网地址或已备案的 HTTPS 域名，并在微信后台配置 request/uploadFile 合法域名。
- 后端密钥：复制 `backend/.env.example` 为 `backend/.env` 后填写；该文件已被 Git 忽略。
- H5 本地调试：后端可设置 `ALLOW_MOCK_LOGIN=true`。生产环境必须设置为 `false`，并配置 `WECHAT_APPID` / `WECHAT_SECRET`。
- 小程序 AppID：`env/.env` 的 `VITE_WX_APPID`。

## 验证

```bash
pnpm type-check
pnpm test:run
pnpm build:h5
pnpm build:mp

cd backend
python -m pytest
```

## 已迁移功能

- 微信登录、H5 本地 mock 登录与首次六步画像引导
- 拍照/相册上传、流式食物识别、食物名称与重量修正
- 日期、餐次、满意度选择和饮食记录保存
- 周日历、每日趋势、记录详情、编辑和删除
- 个人资料、近 30 天统计和每日营养目标估算
- FastAPI、PostgreSQL、Alembic、Docker Compose 与现有自动化测试

营养目标为基于身体资料的估算值，不构成医疗或诊断建议。

饮食记录首页为 `pages/record/index`。未使用的闲聊接口、会话状态和模型已移除，食物识别仍保留。

上传照片存放在私有桶中。后端返回短时签名 URL，照片加载失败和预览时会凭当前登录状态重新申请访问地址；保存和识别时，后端会再次校验图片属于当前用户。小程序的 downloadFile／图片合法域名需包含 `MINIO_PUBLIC_URL` 的域名。
