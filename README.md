# FLAC Music Manager v2 (Theatre of Eternal Music)

MySQLとNode.js (Express) + React (Vite + Tailwind CSS) で構築された、セルフホスト型FLAC音楽ライブラリ管理＆ストリーミングプレイヤーです。

## 主な特徴
- **テキスト主体の高密度・統一UI**: 全ビュー（Albums, Artists, Folders, Playlists, Random, Autogen, History）で統一されたリストコンポーネント（`AlbumRow`, `TrackRow`）を採用。
- **アルバム詳細＆プレイヤーでのカバーアート表示**: アルバム詳細画面でのカバーアート表示（クリックで拡大ライトボックス対応）およびプレイヤーバーでのミニサムネイル表示に対応。
- **マルチディスク＆コンピレーション完全対応**: 複数枚組アルバムの `disc_number` 管理、および `Various Artists` コンピレーションアルバムにおける曲単位のアーティスト（`track_artist`）表示・逆引きに対応。
- **FAISS ベクトル類似検索**: 楽曲の特徴量ベクトルを用いた Autoplay（キュー末尾での自動推薦追加）および Autogen プレイリスト生成に対応。
- **サーバーサイド永続化キュー＆レジューム**: 再生キュー（`play_queue`）と再生位置（`playback_state`）をMySQLに自動保存し、リロードや別端末でも再生状態を復元。

## ディレクトリ構成
```text
├── client/                 # React + Vite + Tailwind CSS フロントエンド
│   ├── src/
│   │   ├── components/     # 共通UI部品 (AlbumRow, TrackRow, PlayerBar, QueueDrawer, ContextMenu 等)
│   │   ├── context/        # グローバル状態・プレイヤー制御 (AppContext)
│   │   └── views/          # 8タブ画面 + アルバム/アーティスト/プレイリスト詳細画面
├── server/                 # Express バックエンドサーバー
│   ├── config/             # MySQL コネクションプール & 除外ディレクトリ設定
│   ├── routes/             # API ルート (libraryRoutes, playerRoutes, playlistRoutes)
│   ├── services/           # FAISS 類似検索・Autogen サービス
│   └── scripts/            # メタデータスキャナー (scanner.js) & DB初期化 (initDb.js)
├── database/               # SQL スキーマ (schema.sql) & Grafana ビュー定義 (views.sql)
└── public/covers/          # 抽出されたアルバムカバー画像
```

## セットアップ ＆ 起動手順

```bash
# 初回セットアップ（依存パッケージのインストール & フロントエンドビルド）
npm run setup

# データベーステーブル & Grafana View の初期化（必要な場合）
npm run init-db

# 音楽ライブラリの差分スキャン（全件再スキャンは npm run scan:full）
npm run scan

# サーバー起動 (デフォルト: http://localhost:3000)
npm start
```
