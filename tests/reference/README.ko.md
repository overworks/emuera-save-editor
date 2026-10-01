# 기준 엔진 검증

[English](README.md) · **한국어** · [日本語](README.ja.md)

브라우저 편집기를 원본 Emuera 세이브 판독기·작성기와 대조하는 검증입니다. 전체 개발 절차는 [CONTRIBUTING.ko.md](../../CONTRIBUTING.ko.md)를 참고하세요.

## 출처

`upstream/`의 C# 파일 3개와 `LICENSE.txt`는 다음 출처에서 수정 없이 가져왔습니다.

- 저장소: [0x00000FF/Emuera](https://github.com/0x00000FF/Emuera).
- 커밋: [`85db4cbd5eb2efe6c5b5449ada351a21a20db60b`](https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b), 원본 Emuera 1.824 소스 보존본.
- 원본 경로: `Emuera/Sub/EraBinaryDataReader.cs`, `Emuera/Sub/EraBinaryDataWriter.cs`, `Emuera/Sub/EraDataStream.cs`.
- Copyright (C) 2008- MinorShift, 妊）|дﾟ)の中の人. 원본 고지와 이용 조건은 [upstream/LICENSE.txt](upstream/LICENSE.txt)에 보존되어 있습니다.

[Program.cs](Program.cs)와 [Oracle.csproj](Oracle.csproj)는 이 프로젝트에서 추가한 테스트 어댑터이며 원본 엔진 파일이 아닙니다. 게임 UI나 스크립트 없이 저장 형식 코드를 실행하도록 최소한의 `Config`와 `FileEE` 호스트를 제공합니다. 어댑터 수정은 원형을 유지한 upstream 소스·라이선스와 분리하세요.

## 검증 범위

원본 작성기는 일반·글로벌 세이브를 바이너리, UTF-8 텍스트, CP932 텍스트로 저장하여 총 6개 자료를 생성합니다. 캐릭터와 값은 가상으로 작성했으며 게임의 세이브에서 가져오지 않았습니다. 자료 생성 시 일반 바이너리 세이브를 [src/assets/demo.sav](../../src/assets/demo.sav)로 복사합니다.

TypeScript 편집기가 세이브를 수정한 뒤 원본 판독기로 결과를 읽습니다. [scripts/reference-check.ts](../../scripts/reference-check.ts)는 편집 전후의 전체 값 사전을 비교하여 의도한 값만 변경되었는지 확인합니다. 텍스트 판독기는 호스트에서 배열 크기를 제공받아야 합니다. 어댑터는 기본 구역에 128요소 배열을 사용하며, 이는 테스트 자료에 충분한 크기일 뿐 다른 게임의 배열 크기를 나타내지 않습니다.

게임 실행 없이 저장 코드의 호환성을 검증합니다. 게임 스크립트 규칙, 실제 사용자 세이브, 모든 Emuera 포크를 검증하지는 않습니다. C# 코드는 개발 검증에만 사용하며 브라우저 번들에는 포함하지 않습니다.

## 실행 방법

프로젝트의 npm 의존성과 .NET 8 SDK를 설치한 뒤 저장소 루트에서 실행합니다.

```sh
npm run test:reference
```

실행 파일이 `PATH`에 없다면 `DOTNET=/absolute/path/to/dotnet`을 설정합니다. [scripts/oracle.ts](../../scripts/oracle.ts)는 어댑터를 `.reference/bin`에 빌드하며 수정된 파일은 `.reference/edited`에 저장됩니다. 둘 다 버전 관리에서 제외되는 빌드·테스트 결과입니다.

저장소의 세이브 자료 6개와 내장 샘플을 의도적으로 재생성하려면 실행합니다.

```sh
npm run fixtures
```

재생성 후 자료의 변경 내용을 검토하고 호환성 검증을 다시 실행하세요. 테스트 자료가 저장소에 포함되어 있으므로 일반 코어 테스트에는 .NET이 필요하지 않습니다.
