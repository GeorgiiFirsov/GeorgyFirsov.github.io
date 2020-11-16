## SPB CTF Leaked Code task solution

In this article I want to describe a solution of a quite simple CTF task. Here it is:
>During internal pentest we've been able to make a photo of security engineer's computer screen.
>It seems that he is reverse engineering his employer's internal access system algorithms. Can you help us get a valid access code?

There were some files attached to the task. One and the only necessary was a text file with following content (but without line numbers):

```java
1.	DEFINE PUBLIC STATIC main([Ljava/lang/String; args)V
2.	A:
3.	LINE A 7
4.	GETSTATIC java/lang/System.out Ljava/io/PrintStream;
5.	LDC "Enter access code : "
6.	INVOKEVIRTUAL java/io/PrintStream.print(Ljava/lang/String;)V
7.	B:
8.	LINE B 8
9.	NEW java/util/Scanner
10.	DUP
11.	GETSTATIC java/lang/System.in Ljava/io/InputStream;
12.	INVOKESPECIAL java/util/Scanner.<init>(Ljava/io/InputStream;)V
13.	ASTORE scanner
14.	C:
15.	LINE C 9
16.	ALOAD scanner
17.	INVOKEVIRTUAL java/util/Scanner.nextLine()Ljava/lang/String;
18.	ASTORE access_code
19.	D:
20.	LINE D 10
21.	LDC "abcdefghijklmnopqrstuvwxyz_!@"
22.	ASTORE alphabet
23.	E:
24.	LINE E 11
25.	ALOAD access_code
26.	INVOKEVIRTUAL java/lang/String.length()I
27.	BIPUSH 24
28.	IF_ICMPEQ H
29.	F:
30.	LINE F 12
31.	GETSTATIC java/lang/System.out Ljava/io/PrintStream;
32.	LDC "Nope!"
33.	INVOKEVIRTUAL java/io/PrintStream.println(Ljava/lang/String;)V
34.	G:
35.	LINE G 13
36.	RETURN
37.	H:
38.	LINE H 15
39.	ALOAD access_code
40.	LDC "spbctf{"
41.	INVOKEVIRTUAL java/lang/String.startsWith(Ljava/lang/String;)Z
42.	IFEQ I
43.	ALOAD access_code
44.	ALOAD access_code
45.	INVOKEVIRTUAL java/lang/String.length()I
46.	ICONST_1
47.	ISUB
48.	INVOKEVIRTUAL java/lang/String.codePointAt(I)I
49.	BIPUSH 125
50.	IF_ICMPEQ K
51.	I:
52.	LINE I 16
53.	GETSTATIC java/lang/System.out Ljava/io/PrintStream;
54.	LDC "Nope!"
55.	INVOKEVIRTUAL java/io/PrintStream.println(Ljava/lang/String;)V
56.	J:
57.	LINE J 17
58.	RETURN
59.	K:
60.	LINE K 19
61.	ICONST_5
62.	ISTORE seed
63.	L:
64.	LINE L 20
65.	BIPUSH 7
66.	ISTORE i
67.	M:
68.	ILOAD i
69.	BIPUSH 23
70.	IF_ICMPGE S
71.	N:
72.	LINE N 21
73.	ALOAD access_code
74.	ILOAD i
75.	INVOKEVIRTUAL java/lang/String.codePointAt(I)I
76.	ALOAD alphabet
77.	ILOAD seed
78.	INVOKEVIRTUAL java/lang/String.codePointAt(I)I
79.	IF_ICMPEQ Q
80.	O:
81.	LINE O 22
82.	GETSTATIC java/lang/System.out Ljava/io/PrintStream;
83.	LDC "Nope!"
84.	INVOKEVIRTUAL java/io/PrintStream.println(Ljava/lang/String;)V
85.	P:
86.	LINE P 23
87.	RETURN
88.	Q:
89.	LINE Q 25
90.	ILOAD seed
91.	ICONST_3
92.	IMUL
93.	ALOAD alphabet
94.	INVOKEVIRTUAL java/lang/String.length()I
95.	IREM
96.	ISTORE seed
97.	R:
98.	LINE R 20
99.	IINC i 1
100.	GOTO M
101.	S:
102.	LINE S 27
103.	GETSTATIC java/lang/System.out Ljava/io/PrintStream;
104.	LDC "Access granted!"
105.	INVOKEVIRTUAL java/io/PrintStream.println(Ljava/lang/String;)V
106.	T:
107.	LINE T 28
108.	RETURN
109.	U:
```

It is a part of some Java application in human-readable bytecode view. Let's analyze it a bit. 
Firstly, we can see a line with number 104 with a string `LDC "Access granted!"`. It is a block
of code which we reach in case of successful parameter check. This parameter is typed by a user
at lines 7-14 (there you can see an input sream initialization, access code request and storing
this code into a variable `access_code`.

So, let's continue! The line with a number 104 is located in block denoted with a label `S`. The
only way to reach label `S` is to make a variable `i` to be equal or greater than 23 at line 70.
Here is a code:
```java
67.	M:
68.	ILOAD i
69.	BIPUSH 23
70.	IF_ICMPGE S
```

Looking closely you can notice a 100'th line with an instruction `GOTO M`. Actually it is a loop,
just because right before unconditional jump the variable `i` was incremented by one. According to
the task we can assume that our access code is checked in this loop symbol-by-symbol.

But firstly, how we can reach this loop in our execution flow? It is not quite difficult to notice that
the loop actually begins at the 63'th line (label `L`). There is no conditional nor unconditional jumps
to this label, so the previous label `K` must be reached before the VM executes an instructions at
the label `L`. The previous to `K` label denotes an exit of application, so there must be some branch
to `K`. It can be found at the 50. Line 50 ends a first simple check, that was started at the line 23:
```java
23.	E:
24.	LINE E 11
25.	ALOAD access_code
26.	INVOKEVIRTUAL java/lang/String.length()I
27.	BIPUSH 24
28.	IF_ICMPEQ H
29.	F:
30.	LINE F 12
31.	GETSTATIC java/lang/System.out Ljava/io/PrintStream;
32.	LDC "Nope!"
33.	INVOKEVIRTUAL java/io/PrintStream.println(Ljava/lang/String;)V
34.	G:
35.	LINE G 13
36.	RETURN
37.	H:
38.	LINE H 15
39.	ALOAD access_code
40.	LDC "spbctf{"
41.	INVOKEVIRTUAL java/lang/String.startsWith(Ljava/lang/String;)Z
42.	IFEQ I
43.	ALOAD access_code
44.	ALOAD access_code
45.	INVOKEVIRTUAL java/lang/String.length()I
46.	ICONST_1
47.	ISUB
48.	INVOKEVIRTUAL java/lang/String.codePointAt(I)I
49.	BIPUSH 125
50.	IF_ICMPEQ K
```

Let me explain what is going on here: lines 25-26 contain a call of virtual method `String.length()` 
on a reference to the variable `access_code`. The result is pushed onto the stack. Than this value is
compared to 24 in lines 27-28. In ase of equality we jump to the label `H`. Otherwise the check fails.
Then it is simple to notice, that the method `String.startsWith()` was called on the reference to the
`access_code` variable. It checks if it starts with `"spbctf{"`. This call can be found in lines 39-41.
In case of negative result the check fails - we jupm to the label `I` which ends the exectution.
Otherwise the last symbol of `access_code` is compared to `}`: at lines 44-47 an index of the last symbol
is calculated by calling `String.lenght()` and subtracting 1 from it. This index is stored in variable
`I` and used to get a code of the last symbol in `access_code` by calling `String.codePointAt()` that
pushes its result into the stack, than we push the value 125 (ASCII code of `}`) onto the stack. In case
of equality we finally jump to the label `K` which starts our loop initialization.

The initialization is quite simple:
```java
59.	K:
60.	LINE K 19
61.	ICONST_5
62.	ISTORE seed
63.	L:
64.	LINE L 20
65.	BIPUSH 7
66.	ISTORE i
```

We set the value 5 to a new variable `seed` and the value 7 to a loop index `i`. The loop starts with
a comparison of our loop index to 23:
```java
67.	M:
68.	ILOAD i
69.	BIPUSH 23
70.	IF_ICMPGE S
```

When the index is less than 23 we start to compare `access_code` symbols to the correct ones:
```java
71.	N:
72.	LINE N 21
73.	ALOAD access_code
74.	ILOAD i
75.	INVOKEVIRTUAL java/lang/String.codePointAt(I)I
76.	ALOAD alphabet
77.	ILOAD seed
78.	INVOKEVIRTUAL java/lang/String.codePointAt(I)I
79.	IF_ICMPEQ Q
```

At lines 73-75 we get the i'th symbol from `access_code` and a seed'th symbol from `alphabet`. `alphabet`
is a simple string `abcdefghijklmnopqrstuvwxyz_!@` created at lines 21-22. In case of equality we jump
to the label `Q`, otherwise the check fails and the program stops. Label `Q` is a place where `i` and
`seed` are modified:
```java
88.	Q:
89.	LINE Q 25
90.	ILOAD seed
91.	ICONST_3
92.	IMUL
93.	ALOAD alphabet
94.	INVOKEVIRTUAL java/lang/String.length()I
95.	IREM
96.	ISTORE seed
97.	R:
98.	LINE R 20
99.	IINC i 1
100.	GOTO M
```

Let's see how it happens. We put `seed`(line 90) and a constant 3 (line 91) onto the stack, than they are
multiplied (line 92), the result is stored on the top of the stack. Then the length of the `alphabet` is 
calculated (lines 93-94). Right after that the remainder of division triple `seed` by the `alphabet`'s length
is calculated. This remainder is assumed to be the new value of `seed`. After that `i` is incremented (line 99)
and unconfitional jump to the label `M` is happened.

As said before, we know initial values of `i` and `seed`, so we can calculate the right symbols in `alphabet`
on each iteration, it can be written as a table:

| i | seed | symbol |
|---|------|--------|
|  7 |  5 | `f` |
|  8 | 15 | `p` |
|  9 | 16 | `q` |
| 10 | 19 | `t` |
| 11 | 28 | `@` |
| 12 | 26 | `_` |
| 13 | 20 | `u` |
| 14 |  2 | `c` |
| 15 |  6 | `g` |
| 16 | 18 | `s` |
| 17 | 25 | `z` |
| 18 | 17 | `r` |
| 19 | 22 | `w` |
| 20 |  8 | `i` |
| 21 | 24 | `y` |
| 22 | 14 | `o` |

Finally we got a flag! The answer is `spbctf{fpqt@_ucgszrwiyo}` (don't forget about the initial check of the last and the first 7 symbols)

----

Author: Georgy Firsov. 2020
