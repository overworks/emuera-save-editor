# 기준 엔진 검증

`upstream/`의 세 C# 파일과 `LICENSE.txt`는 아래 커밋에서 수정 없이 가져왔습니다.

- 출처: https://github.com/0x00000FF/Emuera
- 커밋: `85db4cbd5eb2efe6c5b5449ada351a21a20db60b` (원본 Emuera 1.824 소스)
- 원본 경로: `Emuera/Sub/EraBinaryDataReader.cs`, `Emuera/Sub/EraBinaryDataWriter.cs`, `Emuera/Sub/EraDataStream.cs`
- Copyright (C) 2008- MinorShift, 妊）|дﾟ)の中の人

`Program.cs`와 `Oracle.csproj`는 이 웹 편집기에서 추가한 테스트 어댑터입니다. 게임 UI와 스크립트를 실행하지 않고 저장 형식 코드만 호출하기 위해 `Config`와 `FileEE` 호스트를 제공합니다. 원본 소스라고 주장하지 않습니다.

원본 Writer가 일반/글로벌 × 바이너리/UTF-8 텍스트/CP932 텍스트의 6개 파일을 만듭니다. 샘플 캐릭터와 값은 테스트용으로 작성했으며 다른 게임의 세이브에서 가져오지 않았습니다. 브라우저 코어가 수정한 결과를 원본 Reader에 다시 전달하고, 원본 Reader가 반환한 전체 값 사전에 예상한 변경만 있는지 비교합니다. 텍스트 기본 배열은 엔진에서 크기를 따로 알아야 하므로 테스트 자료에 충분한 128요소 배열로 읽습니다.

Node의 `scripts/reference-check.ts`가 컴파일 및 비교를 수행합니다. .NET 8 SDK가 필요합니다. CI가 아닌 로컬에서도 `npm run test:reference`로 동일한 비교를 실행할 수 있습니다. 기준 C# 코드는 웹 번들에 포함되지 않습니다.
