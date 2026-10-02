// 在 Pi 自己的代码运行之前执行。
// 桌面端是用 Electron 的可执行文件、靠 ELECTRON_RUN_AS_NODE=1 把 Pi 当普通 Node 程序跑起来的。
// 这个变量在进程启动那一刻就已经起了作用，之后留着只有坏处：Pi 运行的每一条命令都会继承它，
// 在那些命令里再启动任何 Electron 应用（npm run dev、electron .、Cypress……）都会被当成 Node 而起不来。
delete process.env.ELECTRON_RUN_AS_NODE
