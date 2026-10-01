# 基準エンジンによる検証

[English](README.md) · [한국어](README.ko.md) · **日本語**

ブラウザーの編集機能を、元の Emuera のセーブ読み込み・書き込みコードと比較します。開発手順全体は [CONTRIBUTING.md（英語）](../../CONTRIBUTING.md) を参照してください。

## 出典

`upstream/` にある 3 つの C# ファイルと `LICENSE.txt` は、次の出典から変更せずにコピーしました。

- リポジトリ: [0x00000FF/Emuera](https://github.com/0x00000FF/Emuera)。
- コミット: [`85db4cbd5eb2efe6c5b5449ada351a21a20db60b`](https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b)。元の Emuera 1.824 ソースの保存版です。
- 元のパス: `Emuera/Sub/EraBinaryDataReader.cs`、`Emuera/Sub/EraBinaryDataWriter.cs`、`Emuera/Sub/EraDataStream.cs`。
- Copyright (C) 2008- MinorShift, 妊）|дﾟ)の中の人。元の表示と利用条件は [upstream/LICENSE.txt](upstream/LICENSE.txt) に保存しています。

[Program.cs](Program.cs) と [Oracle.csproj](Oracle.csproj) は、本プロジェクトが追加したテスト用アダプターであり、元のエンジンのファイルではありません。ゲームの UI やスクリプトなしで保存形式のコードを動かすため、最小限の `Config` と `FileEE` ホストを提供します。アダプターの変更は、原形を維持する upstream のソース・ライセンスと分けてください。

## 検証範囲

元の書き込みコードで、通常・グローバルセーブをバイナリ、UTF-8 テキスト、CP932 テキストとして保存し、計 6 個のテストデータを生成します。キャラクターと値は架空のもので、ゲームのセーブから取り出したものではありません。生成時には通常のバイナリセーブを [src/assets/demo.sav](../../src/assets/demo.sav) にもコピーします。

TypeScript の編集機能でセーブを変更し、その結果を元の読み込みコードで読み込みます。[scripts/reference-check.ts](../../scripts/reference-check.ts) は編集前後の値の辞書全体を比較し、意図した値だけが変わったことを確認します。テキストの読み込みコードには、ホストが配列サイズを渡す必要があります。アダプターは基本セクションに 128 要素の配列を使います。これはテストデータに十分なサイズであり、他のゲームの配列サイズを示すものではありません。

ゲームを実行せずに保存コードの互換性を確認します。ゲームスクリプトのルール、実際のユーザーのセーブ、すべての Emuera 派生版を検証するものではありません。C# コードは開発時の検証専用で、ブラウザーのバンドルには含まれません。

## 実行方法

プロジェクトの npm 依存関係と .NET 8 SDK をインストールし、リポジトリのルートから実行します。

```sh
npm run test:reference
```

実行ファイルが `PATH` にない場合は `DOTNET=/absolute/path/to/dotnet` を設定します。[scripts/oracle.ts](../../scripts/oracle.ts) はアダプターを `.reference/bin` にビルドし、編集結果は `.reference/edited` に保存されます。どちらもバージョン管理から除外されるビルド・テスト出力です。

コミット済みのセーブデータ 6 個と内蔵サンプルを意図的に再生成する場合は、次を実行します。

```sh
npm run fixtures
```

再生成後はデータの差分を確認し、互換性検証を再実行してください。テストデータはリポジトリに含まれているため、通常のコアテストには .NET は不要です。
