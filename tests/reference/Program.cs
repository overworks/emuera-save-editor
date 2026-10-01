using System.Reflection;
using System.Text;
using System.Text.Json;
using MinorShift.Emuera.Sub;

// Minimal host adapters; the three upstream reader/writer files are unmodified.
namespace MinorShift.Emuera {
    internal class FileEE : Exception { public FileEE(string message) : base(message) {} }
    internal static class Config {
        public static Encoding Encode = new UTF8Encoding(true);
        public static Encoding SaveEncode = new UTF8Encoding(true);
    }
}

internal static class Program {
    static readonly string[] Common = ("DAY MONEY ITEM FLAG TFLAG UP PALAMLV EXPLV EJAC DOWN RESULT COUNT TARGET ASSI MASTER NOITEM LOSEBASE SELECTCOM ASSIPLAY PREVCOM NOTUSE_14 NOTUSE_15 TIME ITEMSALES PLAYER NEXTCOM PBAND BOUGHT NOTUSE_1C NOTUSE_1D " + string.Join(" ", "ABCDEFGHIJKLMNOPQRSTUVWXYZ".ToCharArray()) + " NOTUSE_38 NOTUSE_39 NOTUSE_3A NOTUSE_3B").Split(' ');
    static readonly string[] Chara = "BASE MAXBASE ABL TALENT EXP MARK PALAM SOURCE EX CFLAG JUEL RELATION EQUIP TEQUIP STAIN GOTJUEL NOWEX".Split(' ');
    static readonly string Name = "アオイ";
    static long[] Numbers = new long[] { 0, 207, 208, -32768, 32767, 32768, -2147483648, 2147483647, 2147483648, long.MinValue, long.MaxValue, 0 };
    static void Main(string[] args) {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        if (args[0] == "generate") {
            Directory.CreateDirectory(args[1]);
            foreach (bool global in new[] { false, true }) {
                GenerateBinary(Path.Combine(args[1], global ? "global-binary.sav" : "normal-binary.sav"), global);
                foreach (bool sjis in new[] { false, true }) {
                    MinorShift.Emuera.Config.SaveEncode = sjis ? Encoding.GetEncoding(932) : new UTF8Encoding(true);
                    GenerateText(Path.Combine(args[1], (global ? "global" : "normal") + (sjis ? "-sjis.sav" : "-text.sav")), global);
                }
            }
            return;
        }
        MinorShift.Emuera.Config.Encode = args.Length > 3 && args[3] == "shift_jis" ? Encoding.GetEncoding(932) : new UTF8Encoding(true);
        using var fs = File.OpenRead(args[1]);
        var binary = EraBinaryDataReader.CreateReader(fs);
        var output = binary != null ? ReadBinary(binary) : ReadText(new EraDataReader(fs), args[2] == "global");
        Console.WriteLine(JsonSerializer.Serialize(output));
    }
    static void GenerateBinary(string path, bool global) {
        using var w = new EraBinaryDataWriter(File.Create(path));
        w.WriteHeader(); w.WriteFileType(global ? EraSaveFileType.Global : EraSaveFileType.Normal);
        w.WriteInt64(4242); w.WriteInt64(100); w.WriteString(global ? "" : "はじまりの街 · 새로운 모험");
        if (!global) {
            w.WriteInt64(1);
            w.WriteWithKey("NAME", Name); w.WriteWithKey("CALLNAME", "あおい"); w.WriteWithKey("NO", 7L);
            w.WriteWithKey("ABL", new long[] { 1, 0, 3, 0, 5 });
            w.WriteWithKey("BASE", new long[] { 100, 80 });
            w.WriteSeparator(); w.WriteWithKey("CUSTOM", new string[,] { { "", "한글" }, { "日本語", "😀" } });
            w.WriteEOC();
            w.WriteWithKey("DAY", new long[] { 12 }); w.WriteWithKey("MONEY", new long[] { 2500 });
        }
        w.WriteWithKey(global ? "GLOBAL" : "FLAG", Numbers);
        w.WriteWithKey(global ? "GLOBALS" : "SAVESTR", new string[] { "", "保存", "", "한글😀", "" });
        var two = new long[4, 5]; two[1, 2] = -9; two[3, 4] = 16;
        var three = new long[4, 4, 5]; three[1, 0, 2] = 5; three[1, 2, 4] = -7; three[3, 2, 1] = 42;
        w.WriteWithKey("DA", two); w.WriteWithKey("TA", three);
        w.WriteWithKey("TEXT3", new string[,,] { { { "", "a" }, { "b", "" } }, { { "", "" }, { "", "c" } } });
        w.WriteEOF();
    }
    static void GenerateText(string path, bool global) {
        using var w = new EraDataWriter(File.Create(path));
        ((StreamWriter)typeof(EraDataWriter).GetField("writer", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(w)).NewLine = "\r\n";
        w.Write(4242L); w.Write(100L);
        if (!global) {
            w.Write("はじまりの街"); w.Write(1L);
            w.Write(Name); w.Write("あおい"); w.Write(0L); w.Write(7L);
            foreach (var name in Chara) w.Write(name == "ABL" ? new long[] { 1, 0, 3, 0, 5 } : name == "BASE" ? new long[] { 100, 80 } : new long[0]);
            foreach (var name in Common) w.Write(name == "MONEY" ? new long[] { 2500 } : name == "DAY" ? new long[] { 12 } : name == "FLAG" ? Numbers : new long[0]);
            w.Write(new string[] { "", "保存" });
            w.EmuStart();
            w.WriteExtended("NICKNAME", "旅人"); w.EmuSeparete();
            for (int i = 1; i < 6; i++) w.EmuSeparete();
            w.EmuSeparete(); w.EmuSeparete(); // shared scalar string, int
            w.WriteExtended("TSTR", new string[] { "", "冒険" }); w.EmuSeparete();
            w.WriteExtended("RANDDATA", new long[] { 12, -23 }); w.EmuSeparete();
            w.EmuSeparete();
            w.WriteExtended("DA", new long[,] { { 0, 7 }, { 0, 0 }, { 3, 0 } }); w.EmuSeparete();
            w.EmuSeparete();
            var a = new long[3, 3, 3]; a[0, 1, 2] = 9; a[2, 2, 1] = -5;
            w.WriteExtended("TA", a); w.EmuSeparete();
        } else {
            w.Write(Numbers); w.Write(new string[] { "", "保存" }); w.EmuStart();
        }
        w.WriteExtended("NOTES", new string[] { "", "記録" }); w.EmuSeparete();
        w.WriteExtended("CUSTOM_NUMBER", new long[] { 5, 0, -1 }); w.EmuSeparete();
        for (int i = 2; i < 6; i++) w.EmuSeparete();
    }
    static Dictionary<string, string> ReadBinary(EraBinaryDataReader r) {
        var result = new Dictionary<string, string>();
        bool global = r.ReadFileType() == EraSaveFileType.Global;
        result["code"] = r.ReadInt64().ToString(); result["version"] = r.ReadInt64().ToString(); result["description"] = r.ReadString();
        int chars = global ? 0 : (int)r.ReadInt64();
        result["chars"] = chars.ToString();
        int scope = chars > 0 ? 0 : -1;
        while (true) {
            var v = r.ReadVariableCode();
            if (v.Value == EraSaveDataType.EOF) break;
            if (v.Value == EraSaveDataType.Separator) continue;
            if (v.Value == EraSaveDataType.EOC) { scope++; if (scope == chars) scope = -1; continue; }
            string key = scope + ":" + v.Key;
            int rank = (int)v.Value & 3;
            bool str = ((int)v.Value & 16) != 0;
            if (rank == 0) { result[key + ":"] = str ? r.ReadString() : r.ReadInt().ToString(); continue; }
            var raw = (BinaryReader)typeof(EraBinaryDataReader).GetField("reader", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(r);
            long position = raw.BaseStream.Position;
            var dims = Enumerable.Range(0, rank).Select(_ => raw.ReadInt32()).ToArray();
            raw.BaseStream.Position = position;
            var array = Array.CreateInstance(str ? typeof(string) : typeof(long), dims);
            switch (v.Value) {
                case EraSaveDataType.IntArray: r.ReadIntArray((long[])array, true); break;
                case EraSaveDataType.IntArray2D: r.ReadIntArray2D((long[,])array, true); break;
                case EraSaveDataType.IntArray3D: r.ReadIntArray3D((long[,,])array, true); break;
                case EraSaveDataType.StrArray: r.ReadStrArray((string[])array, true); break;
                case EraSaveDataType.StrArray2D: r.ReadStrArray2D((string[,])array, true); break;
                case EraSaveDataType.StrArray3D: r.ReadStrArray3D((string[,,])array, true); break;
                default: throw new Exception("Unknown tag");
            }
            for (int i = 0; i < array.Length; i++) {
                int n = i; var indices = new int[rank];
                for (int j = rank - 1; j >= 0; j--) { indices[j] = n % dims[j]; n /= dims[j]; }
                result[key + ":" + string.Join(",", indices)] = array.GetValue(indices)?.ToString() ?? "";
            }
        }
        return result;
    }
    static Dictionary<string, string> ReadText(EraDataReader r, bool global) {
        var result = new Dictionary<string, string>();
        result["code"] = r.ReadInt64().ToString(); result["version"] = r.ReadInt64().ToString();
        int chars = 0;
        void ints(string key) { var a = new long[128]; r.ReadInt64Array(a); for (int i = 0; i < a.Length; i++) result[key + ":" + i] = a[i].ToString(); }
        void strs(string key) { var a = new string[128]; r.ReadStringArray(a); for (int i = 0; i < a.Length; i++) result[key + ":" + i] = a[i] ?? ""; }
        void sections(int scope, int rank, bool scalar) {
            string prefix = scope + ":";
            if (scalar) {
                foreach (var v in r.ReadStringExtended()) result[prefix + v.Key + ":"] = v.Value;
                foreach (var v in r.ReadInt64Extended()) result[prefix + v.Key + ":"] = v.Value.ToString();
            }
            foreach (var v in r.ReadStringArrayExtended()) for (int i = 0; i < v.Value.Count; i++) result[prefix + v.Key + ":" + i] = v.Value[i];
            foreach (var v in r.ReadInt64ArrayExtended()) for (int i = 0; i < v.Value.Count; i++) result[prefix + v.Key + ":" + i] = v.Value[i].ToString();
            if (rank < 2) return;
            r.ReadStringArray2DExtended();
            foreach (var v in r.ReadInt64Array2DExtended()) for (int i = 0; i < v.Value.Count; i++) for (int j = 0; j < v.Value[i].Length; j++) result[prefix + v.Key + ":" + i + "," + j] = v.Value[i][j].ToString();
            if (rank < 3) return;
            r.ReadStringArray3DExtended();
            foreach (var v in r.ReadInt64Array3DExtended()) for (int i = 0; i < v.Value.Count; i++) for (int j = 0; j < v.Value[i].Count; j++) for (int k = 0; k < v.Value[i][j].Length; k++) result[prefix + v.Key + ":" + i + "," + j + "," + k] = v.Value[i][j][k].ToString();
        }
        if (global) { ints("-1:GLOBAL"); strs("-1:GLOBALS"); result["description"] = ""; }
        else {
            result["description"] = r.ReadString(); chars = (int)r.ReadInt64();
            for (int c = 0; c < chars; c++) {
                foreach (string name in new[] { "NAME", "CALLNAME" }) result[c + ":" + name + ":"] = r.ReadString();
                foreach (string name in new[] { "ISASSI", "NO" }) result[c + ":" + name + ":"] = r.ReadInt64().ToString();
                foreach (string name in Chara) ints(c + ":" + name);
            }
            foreach (string name in Common) ints("-1:" + name);
            strs("-1:SAVESTR");
        }
        result["chars"] = chars.ToString();
        if (r.SeekEmuStart()) {
            if (!global) { for (int c = 0; c < chars; c++) sections(c, 2, true); sections(-1, 3, true); }
            sections(-1, 3, false);
        }
        return result;
    }
}
