using System;
using System.Diagnostics;
using System.IO;
using System.Runtime;

namespace git_peek_windows_launcher
{
  class Program
  {
    public static string FindExePath(string exe)
    {
      exe = Environment.ExpandEnvironmentVariables(exe);
      if (!File.Exists(exe))
      {
        if (Path.GetDirectoryName(exe) == String.Empty)
        {
          foreach (string test in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
          {
            string path = test.Trim();
            if (!String.IsNullOrEmpty(path) && File.Exists(path = Path.Combine(path, exe)))
              return Path.GetFullPath(path);
          }
        }
        throw new FileNotFoundException(new FileNotFoundException().Message, exe);
      }
      return Path.GetFullPath(exe);
    }

    static void Main(string[] args)
    {
      var startInfo = new ProcessStartInfo();
      startInfo.FileName = FindExePath("node.exe");

      Console.WriteLine("FILE: " + startInfo.FileName);
      Console.WriteLine("RUN " + startInfo.Arguments);


      var list = new System.Collections.Generic.List<string>();
      list.Add(System.AppContext.BaseDirectory + "\\git-peek");
      list.AddRange(args);
      list.Add("--fromscript ");

      startInfo.Arguments = String.Join(" ", list.ToArray());
      startInfo.UseShellExecute = false;
      startInfo.RedirectStandardError = true;
      startInfo.CreateNoWindow = true;
      startInfo.WindowStyle = ProcessWindowStyle.Hidden;


      using (Process p = Process.Start(startInfo))
      {
        p.WaitForExit();
        p.Close();
        Environment.Exit(0);
      }

    }
  }
}
