## GRP Click

![GRP Click](grp-click-logo.png)

Controls PowerPoint (Mac and Windows) and Keynote (Mac) on presentation machines, through the **GRP Click Receiver** installed on each one.

1. Install the GRP Click Receiver on each presentation machine. Windows shows its IP address at the end of the install; on a Mac it's in System Settings → Network.
2. Put each machine's IP address into this connection (Machines 1–10). Leave the port at 8765.

The receiver never opens PowerPoint or Keynote itself: open the presentation first. If both are open on a Mac, it controls PowerPoint.

**Actions** (each has a **Machine** option): next, previous, first, last, go to slide number, start show, end show.
Go to slide works in Keynote and PowerPoint for Windows. PowerPoint for Mac can't do it.

**Presets** for Machines 1 and 2 (change the Machine option on a button for others). Buttons turn **red** when the machine can't be reached and **amber** when the last command didn't work (for example, no slideshow running). The status button shows Connected / Not connected.

**Variables:** `mN_status`, `mN_platform` (Mac or Windows), `mN_version` (receiver), `mN_error` (last error), where N is the machine number.

No password: use it only on a private show network.
