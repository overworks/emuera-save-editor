# 기여 가이드

[English](CONTRIBUTING.md) · **한국어** · [日本語](CONTRIBUTING.ja.md)

개발과 리뷰를 위한 문서입니다. 앱 사용법은 [README](README.ko.md), 코드 구조와 형식별 보존 규칙은 [AGENTS.ko.md](AGENTS.ko.md)를 참고하세요.

## 개발 환경

Node.js 22.x(22.12 이상), 24.x 또는 26.x와 npm을 사용합니다. 이 버전들은 현재 빌드·테스트 의존성의 요구 사항을 충족합니다. 저장소 루트에서 명령을 실행하세요.

```sh
npm ci
npm run dev
```

앱은 React, TypeScript, Vite를 사용합니다. 의존성을 변경하면 `package.json`과 `package-lock.json`에 함께 반영하세요. .NET 8 SDK는 테스트 자료를 재생성하거나 기준 엔진 검증을 실행할 때만 필요하며, 웹앱 실행에는 필요하지 않습니다.

## 명령어

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm test` | Vitest로 코어 테스트 실행 |
| `npm run build` | TypeScript 검사 및 `dist/` 생성 |
| `npm run preview` | 기존 `dist/` 빌드를 로컬에서 제공 |
| `npm run test:e2e` | 미리보기 서버를 대상으로 Playwright 테스트 실행 |
| `npm run fixtures` | 원본 엔진 작성기로 가상 세이브와 내장 샘플 재생성; .NET 8 필요 |
| `npm run test:reference` | 원본 엔진 판독기로 수정된 세이브 대조; .NET 8 필요 |

현재 별도의 린트·포맷 명령은 없습니다.

## 변경에 맞는 검증

구현을 변경했다면 다음을 실행합니다.

```sh
npm test
npm run build
```

UI, Worker, 파일 가져오기·내보내기, 자산 로딩을 변경했다면 브라우저 테스트도 실행합니다. 처음 실행하기 전에 Chromium을 한 번 설치하세요.

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright는 빌드된 `dist/`를 제공하므로 소스를 변경한 뒤 다시 빌드해야 합니다. 설정된 미리보기 주소는 `http://127.0.0.1:4173`입니다. 테스트는 파일 편집·다시 열기, CSV 이름표, 인코딩 선택, 오프라인 사용, 잘못된 입력, 모바일 대화상자 동작을 다룹니다.

파서, 직렬화, 인코딩을 변경했다면 .NET 8 SDK를 설치하고 독립적인 기준 엔진 검증도 실행합니다.

```sh
npm run test:reference
```

`dotnet`이 `PATH`에 없다면 실행 파일 경로를 지정합니다.

```sh
DOTNET=/absolute/path/to/dotnet npm run test:reference
```

테스트 자료는 저장소에 포함되어 있어 일반 개발과 `npm test`에는 .NET이 필요하지 않습니다. `npm run fixtures`는 가상 테스트 자료를 의도적으로 갱신할 때만 실행하세요. 세이브 자료 6개와 `src/assets/demo.sav`를 덮어씁니다. 변경 내용을 검토하고 관련 검증을 다시 실행하세요. 출처와 검증의 한계는 [기준 엔진 검증](tests/reference/README.ko.md)에 설명되어 있습니다.

문서만 변경했다면 상대 링크, `package.json`과 명령어의 일치 여부, 세 언어 사이의 내용 일관성을 확인합니다. 문장만 바꾼 경우 앱 테스트는 필요하지 않습니다. 실행한 검증과 실행하지 못한 관련 검증을 명시하세요.

## 개발 지침

- 형식 파싱, 직렬화, 인코딩, 편집 로직은 React와 DOM에 의존하지 않는 `src/core/`에 둡니다. 파일 처리는 Worker에서 수행하고 `src/client.ts`를 통해 `src/worker.ts`에 정의한 타입이 있는 메시지를 사용합니다.
- 정확한 부호 있는 64비트 값, 수정 구역 밖의 원본 바이트, 희소 배열 처리, 내보내기 전 검증을 유지합니다. 세부 보존 규칙은 [AGENTS.ko.md](AGENTS.ko.md)를 따릅니다.
- 사용자 파일은 브라우저 메모리에 둡니다. 부수적인 의존성으로 업로드 서비스, 외부 런타임 자산, 분석 도구, 영구 작업 저장소를 추가하지 않고 정적·브라우저 전용 구조를 유지합니다.
- 주변 TypeScript 코드의 스타일을 따릅니다. 엄격한 타입, 공백 2칸 들여쓰기, 작은따옴표, 세미콜론을 사용합니다. 변경에 적합한 기존 추상화와 의존성을 우선 활용합니다.
- 키보드 탐색, 접근 가능한 컨트롤 이름, 대화상자 포커스, 오류 안내, 좁은 화면의 사용성을 유지합니다. 제품 UI는 영어·한국어·일본어를 지원하며 번역 문구를 좁은 화면에서도 확인합니다.
- 의미 있는 동작 변경, 특히 저장 형식 수정에는 회귀 검증을 추가합니다. 사용자 세이브나 게임 자산 대신 작은 가상 사례를 사용합니다. 기준 엔진 대조는 TypeScript 직렬화 구현과 독립적으로 유지합니다.
- `tests/reference/upstream/`의 원본 엔진 소스와 라이선스를 변경 없이 보존합니다. 테스트 호스트 수정은 `tests/reference/Program.cs`에 둡니다. 기준 버전을 의도적으로 갱신한다면 출처와 호환성 문서도 갱신해야 합니다.
- 생성된 빌드·테스트 결과, 로컬 설정, 자격 증명은 커밋에서 제외합니다. `dist/`, `node_modules/`, `.reference/`, Playwright 보고서, .NET 빌드 결과는 무시하며, 가상 테스트 자료와 내장 샘플은 의도적으로 버전 관리합니다.

## 화면 번역

화면 문구는 [src/messages.ts](src/messages.ts)에 추가하거나 수정합니다. 각 항목은 영어, 한국어, 일본어 순서입니다. 보간 매개변수를 일치시키고 영어의 개수 표현에는 단수·복수를 처리하세요. 컴포넌트에 화면 문구나 접근성 이름을 직접 넣는 대신 언어 제공자를 사용합니다. 오류와 CSV 경고는 `src/core/diagnostic.ts`의 구조화된 메시지로 전달하여 세이브를 다시 처리하지 않고도 표시 중인 메시지의 언어를 바꿀 수 있도록 합니다. 사용자 데이터를 번역하거나 저장된 64비트 값을 지역화된 숫자로 바꾸지 마세요.

언어 우선순위는 URL, 브라우저 환경 설정, 영어 순서입니다. 선택기는 `lang` 쿼리 매개변수만 변경하며 브라우저 영구 저장소를 사용하지 않습니다. 오프라인 전환을 위해 번역 자료를 번들에 포함합니다. 번역을 변경하면 `npm test`, `npm run build`, `npm run test:e2e`를 통과해야 합니다. 브라우저 테스트는 세 언어, 작업 유지, 오류 번역, 모바일 화면을 검증합니다.

## 문서와 번역

유지보수하는 프로젝트 문서의 기본 언어와 기준본은 영어입니다. 각 영어 문서 옆에 한국어와 일본어 번역을 둡니다.

| 대상 | 영어 | 한국어 | 일본어 |
| --- | --- | --- | --- |
| 사용자 | [README.md](README.md) | [README.ko.md](README.ko.md) | [README.ja.md](README.ja.md) |
| 기여자 | [CONTRIBUTING.md](CONTRIBUTING.md) | [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md) | [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md) |
| 코딩 에이전트 | [AGENTS.md](AGENTS.md) | [AGENTS.ko.md](AGENTS.ko.md) | [AGENTS.ja.md](AGENTS.ja.md) |
| 기준 테스트 유지보수자 | [tests/reference/README.md](tests/reference/README.md) | [tests/reference/README.ko.md](tests/reference/README.ko.md) | [tests/reference/README.ja.md](tests/reference/README.ja.md) |

내용을 변경할 때 세 언어 버전을 함께 갱신합니다. 각 문서에 언어 전환 링크를 넣고, 번역이 있다면 같은 언어의 문서로 연결하세요. 명령, 파일 경로, 형식 구분자, 실제 UI 문구는 그대로 두고 번역 설명을 덧붙일 수 있습니다. 새 문서에도 같은 규칙을 적용합니다. 외부 소스의 주석과 법적 고지는 원문 그대로 보존합니다.

사용법, 기능, 개인정보 처리, 사용자에게 보이는 제한은 README에, 기여자의 작업 절차는 CONTRIBUTING에, 저장소 탐색 정보와 구현 보존 규칙은 AGENTS에 둡니다. 전체 절을 반복하기보다 문서 사이에 링크를 사용하세요.

## 정적 호스팅

프로덕션 번들을 빌드하고 로컬에서 확인합니다.

```sh
npm run build
npm run preview
```

생성된 자산을 포함해 `dist/` 디렉터리 전체를 HTTP(S) 정적 호스팅에 게시합니다. Vite 설정은 상대 자산 경로를 위해 `base: './'`를 사용하므로 하위 경로에서도 제공할 수 있습니다. 백엔드 API나 라우팅 재작성 규칙은 필요하지 않습니다. 호스팅된 위치에서 내장 샘플과 Worker가 동작하는지 확인하세요. `file://` 직접 실행과 서비스 워커를 통한 오프라인 재접속은 지원하지 않습니다.

[GitHub Pages 워크플로](.github/workflows/pages.yml)는 `main`에 변경 사항을 푸시하면 [Emuera Save Studio](https://overworks.github.io/emuera-save-editor/)에 배포합니다. Node.js 24에서 `npm ci`로 잠금 파일의 의존성을 설치하고, 단위 테스트, 앱 빌드, Chromium 브라우저 테스트를 수행한 뒤 `dist/`를 업로드합니다. 배포에는 `github-pages` 환경을 사용합니다. Actions는 커밋 SHA로 고정하며, 업그레이드할 때 SHA와 버전 주석을 함께 갱신합니다.

포크나 새 저장소에서는 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 한 번 설정합니다. `main`에 푸시하거나 **Actions → Deploy to GitHub Pages → Run workflow**에서 `main`을 선택해 실행하세요. 배포 작업은 `main`만 게시합니다. Actions에서 실행 결과와 배포 주소를 확인할 수 있습니다. 배포 후 저장소 경로를 포함한 주소에서 샘플, 세이브 불러오기·편집·다운로드, 언어 전환을 확인하세요. 호스팅 주소가 바뀌면 README 링크도 함께 갱신합니다. 호스팅 요구 사항은 [GitHub Pages 워크플로 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 참고하세요.

## 변경 제출

변경 범위를 집중시키고 문제, 결과 동작, 관련 호환성 제한, 수행한 검증을 설명합니다. UI 변경은 동작을 리뷰할 수 있는 시각 자료를 함께 제공합니다. 저장 형식 변경은 근거가 되는 소스를 기록하고 재현 가능한 가상 사례를 추가합니다. 형식 검증 성공을 모든 게임이나 엔진 포크에 대한 검증으로 설명하지 마세요.
