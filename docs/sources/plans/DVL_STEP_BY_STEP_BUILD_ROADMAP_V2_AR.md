# DVL Code 😈 — خريطة البناء نقطة بنقطة V2

التاريخ: 13 أكتوبر 2026  
الهدف: بناء Desktop Coding Agent كامل، ثم Dynamic Project Environment، دون تجاوز مراحل أو اعتبار التصميم تنفيذًا.  
نوع الوثيقة: خطة تنفيذ مقترحة مبنية على الملفات المرفقة؛ ليست تقرير اختبارات جديدة أو إعلان تجميد رسمي.

## 1. القرار العملي

نحافظ على عمل DVL الموجود، ونبني المنتج انطلاقًا من أول اعتماد تنفيذي ناقص. هدفنا الأول: Desktop Coding Agent حقيقي بـWorker واحد، Provider واحد، ومشروع واحد نشط، يقرأ ويعدّل ويختبر ويعرض النتيجة ويسترجع العمل بأمان. هذا أول milestone، وليس نهاية DVL.

نبدأ الآن بالمرحلة 00: تثبيت المرجع والأدلة الحالية. بعد إغلاقها نثبت نطاق المرحلة الأولى، ثم نبني أساس Desktop. لا نبدأ بـ400–500 Worker، ولا نعيد اختراع Core الموجود، ولا نعتبر أن الـDesktop Shell وحده Coding Agent.

هذه الخريطة هي ترتيب تطوير، لا تغيير لمسار تشغيل DVL النهائي. تأجيل تنفيذ Planning/URG/Compiler المتقدم لا يعني حذفها من المنتج. الحد الأدنى في الـMVP يستخدم Task Contract صريحًا محدودًا، دون اختراع Graph موازٍ أو منح Worker سلطة Project Truth.

## 2. معنى «حاضرة»

| الحالة | معناها | هل تسمح بالتجاوز؟ |
|---|---|---|
| حاضر كتعريف | تجربة المنتج أو المسؤولية مكتوبة | لا تثبت أن الكود موجود |
| حاضر كمعمارية | عقود وحالات وآليات محددة | يلزم التنفيذ واختبار الربط |
| مجرّب في نطاق | تقرير يذكر نجاح Spike أو حالة محلية | يعاد استعماله داخل ذلك النطاق فقط |
| غير مثبت كمنتج | لم يتوفر دليل على نظام قابل لإعادة الاستعمال | يبقى ناقصًا حتى الإثبات |
| CLOSED / GREEN-SCOPED | تنفيذ واختبار وربط ومراجعة وأدلة بلا blocker داخل نطاق محدد | يسمح بالمرحلة التالية ضمن ذلك النطاق |

لا نعطي GREEN للتصميم بنفس معنى GREEN للتنفيذ. كلمة FROZEN تعني مرجعًا محفوظًا، ولا تعني أن المنتج يعمل.

## 3. أين وصل DVL حسب الأدلة المتاحة؟

| الجزء | الموجود | ما الذي لا نستنتجه منه؟ |
|---|---|---|
| Product Baseline | تجربة Desktop Coding Agent وRooms محددة | التطبيق منفذ بالكامل |
| Core V0.3.2 | عقد ثابت لـSpike: Kernel، Authority، Evidence، Isolation، Recovery | آخر نسخة كود أو قانون إنتاجي نهائي |
| H1 | checkpoint تاريخي: commit `3d616af`، 37/37 PASS وCI بحسب H1-solved | أن هذه أحدث نتائج Core |
| H1–H4 / Core V2 | خريطة 13 أكتوبر تنقل 82/82 و318/318 مرتين، ضمن macOS | تحقق مباشر مني من الكود أو logs؛ أو إثبات Windows/Linux/power loss |
| V1→V7 | تقارير تجارب deterministic حول decisions، HOLD، stale candidates وGC | اكتشاف كل العلاقات أو صحة كل مشروع |
| Teamspace | خريطة 13 أكتوبر تنقل تجربة محلية حقيقية بcontroller محدود | وجود Harness/Controller عام للمنتج |
| Planning/URG/Compiler | اتجاه معماري وتجارب | subsystem عام مدمج في Desktop |
| Orchestrator/Smart Décalage | آليات تنسيق مدروسة | Runtime منتج جاهز |
| Review/Security/Audit | اتجاه ومخاطر وقواعد مقترحة | نظام trust tracks منفذ ومقفول |
| Desktop/Harness/Provider/Agent loop | لا يوجد في المواد المقروءة إثبات كافٍ لإغلاقها كمنتج | أنها لم تُكتب في مكان آخر؛ المطلوب دليل قبل تغيير الحالة |

تنبيه مصدر مهم: تحديث 8 أكتوبر يقول إن H4 غير مقفول؛ خريطة 13 أكتوبر تنقل تقدمًا أحدث. نحتفظ بالتاريخين، ونطلب ربط ادعاء الإغلاق الأحدث بالنسخة والاختبارات الخاصة به. لا نرجع H4 للخلف بلا سبب، ولا نقفله بمجرد جملة في تقرير.

## 4. القانون الذي يحكم جميع المراحل

كل مرحلة تمرّ بهذه الدورة: نحدد المطلوب وحدود النطاق → ننفذ → نختبر وظيفة المرحلة → نحقن فشلًا مناسبًا → نربط بما قبلها → نراجع → نحفظ الدليل → نقرر CLOSED أو REWORK أو BLOCKED.

لا يلزم مشروع كامل مستقل لاختبار كل دالة؛ اختبار المرحلة يكون مناسبًا لخطرها. المراحل التي تتعامل مع ملفات أو Runtime أو Provider تحتاج تجربة فعلية، لا mock وحده. الاختبارات الشاملة تُعاد عندما تتغير الحدود المشتركة أو توجد مخاطرة تراجع.

إذا فشلت نقطة: نصلح صاحب الفشل، ثم نعيد السيناريو الذي فشل واختبارات التراجع المتأثرة. لا نعوض الإصلاح بإضافة طبقة جديدة. لا نفتح المرحلة التالية التي تعتمد على النتيجة الفاشلة. بحث جانبي ممكن، لكنه لا يغلق Gate.

الحماية الأساسية، سجل الأحداث، checkpoints، Verification وIntegration تدخل قبل التشغيل الحقيقي. الذي يتأجل هو توسيع هذه الخدمات، لا القانون نفسه. كذلك مراجعة أمن التنفيذ تكون أثناء البناء، حتى لو منتج Security Room المتقدم يأتي لاحقًا.

كل نقطة أدناه مطلوبة قبل إغلاق مرحلتها. الحالة الابتدائية للنقاط الجديدة: TODO، وللموجود: REUSE / NEEDS EVIDENCE. لا نؤشر نقطة DONE بمجرد وجودها في هذه الخريطة.

## المرحلة 00 — تثبيت المرجع الحالي والأدلة

**الحالة:** أول خطوة الآن؛ تعريف المنتج موجود، أدلة Core الأحدث منقولة وتحتاج ربطًا.

- [ ] 00.1 تحديد Product Baseline والعقد التنفيذي الحالي والنسخة الأحدث من Core؛ الوثيقة الأحدث وحدها لا تلغي مرجعًا مقفولًا.
- [ ] 00.2 ربط H1–H4 بالـrepo والـcommit والـplatform والـlogs والمراجعة؛ الحصول على Core V2 وتقرير Teamspace إذا كانا المرجع الأحدث.
- [ ] 00.3 سجل الموجود: reusable code، Spike محدود، تصميم فقط، نقص، blocker.
- [ ] 00.4 تصنيف gaps: ما يمنع MVP المحلي الآن، وما يخص منصة أخرى أو أثرًا خارجيًا لاحقًا.
- [ ] 00.5 إعادة التحقق من baseline التنفيذي المعتمد قبل دمجه بالمنتج؛ لا إعادة مراجعات نصية بلا نهاية.
- [ ] 00.6 تثبيت مرجع قابل للعودة وتسجيل قرار النطاق؛ ممنوع تغيير القانون بصمت.

**الاختبار:** تشغيل الفحوص المناسبة للنسخة التي سنعتمد عليها، مع توثيق أي فرق عن الأرقام التاريخية.  
**Gate:** نعرف بالضبط ما سنعيد استعماله وما لم يثبت. أي blocker داخل نطاق MVP يُحل أولًا. لا يشترط إغلاق كل مشكلة إنتاجية أو remote effect لبداية MVP محلي، لكن القدرات غير الآمنة تبقى غير مفعلة.

## المرحلة 01 — تحديد نطاق أول منتج وتقنية البناء

**الحالة:** هدف المنتج موجود؛ قرارات التنفيذ النهائية تحتاج تثبيتًا.

- [ ] 01.1 macOS أولًا، واختبار على جهاز المستخدم 8 GB؛ تأكيد النسخة والمعالج قبل اختيار dependencies.
- [ ] 01.2 مشروع نشط واحد، Worker واحد، Provider API واحد؛ باقي قدرات DVL محفوظة كمراحل لاحقة.
- [ ] 01.3 تحديد stacks التي يدعمها MVP صراحةً، وحدود ملفات المشروع والأوامر والـnetwork.
- [ ] 01.4 Spike قصير لاختيار Desktop stack وربطه بكود Core الموجود؛ Tauri أو Electron خيار هندسي، لا قرار مفروض هنا.
- [ ] 01.5 تحديد contract مبسط للمهمة: هدف، scope، acceptance، evidence، limits وbasis.
- [ ] 01.6 تثبيت ما يحتاجه MVP من permissions وresume وpreview، ومعايير إغلاقه.

**الاختبار:** تطبيق صغير على الجهاز المستهدف يفتح مشروعًا ويتصل بخدمة محلية، مع قياس RAM والبناء والتشغيل.  
**Gate:** stack قابل للتشغيل ونطاق واضح، دون ادعاء اختيار stack الأفضل قبل التجربة.

## المرحلة 02 — Repo وبناء قابل للإعادة

**الحالة:** repo الخاص بالـSpike معروف تاريخيًا؛ repo المنتج يحتاج تحديدًا.

- [ ] 02.1 إنشاء أو اختيار repo المنتج وربط Core كوحدة واضحة، لا نسخه بطريقة تنشئ حقيقتين.
- [ ] 02.2 تنظيم UI، runtime، provider adapter، storage وtests حسب الحدود.
- [ ] 02.3 تثبيت dependencies وتعليمات تشغيل وبناء من checkout نظيف.
- [ ] 02.4 إعداد CI للفحوص المناسبة وإبقاء اختبارات Core المعتمدة.
- [ ] 02.5 تسجيل إصدارات البروتوكول والـschema وإجراءات تغييرها.

**الاختبار:** checkout نظيف → install → tests → build → run.  
**Gate:** شخص آخر يستطيع بناء نفس النسخة دون خطوات خفية.

## المرحلة 03 — Desktop Shell

**الحالة:** غير مثبت كمنتج في الملفات.

- [ ] 03.1 نافذة DVL، تشغيل وإغلاق ورسائل أخطاء مفهومة.
- [ ] 03.2 قنوات اتصال UI↔runtime محددة؛ الواجهة لا تمنح authority.
- [ ] 03.3 panels أولية: Chat، Files/Activity، Terminal، Live Product.
- [ ] 03.4 startup/shutdown supervision وعدم ترك عمليات DVL دون إدارة.
- [ ] 03.5 التعامل مع فشل runtime أو الاتصال دون حالة نجاح وهمية.

**الاختبار:** فتح وإغلاق متكرر، قتل runtime، إعادة تشغيل وإعادة اتصال الواجهة.  
**Gate:** التطبيق يعمل بثبات، والحالة تعرض الواقع.

## المرحلة 04 — فتح وإنشاء مشروع

- [ ] 04.1 Open Folder ومسار canonical وهوية project محفوظة.
- [ ] 04.2 New Project باسم ومجلد يختاره المستخدم.
- [ ] 04.3 Recent Projects واسترجاع المشروع بعد إعادة الفتح.
- [ ] 04.4 التعامل مع folder مفقود أو غير قابل للقراءة أو مشروع غير Git.
- [ ] 04.5 اختبار مسارات فيها spaces/Arabic/symlinks وفق السياسة.
- [ ] 04.6 فصل source الذي يختاره المستخدم عن transaction workspace.

**الاختبار:** مشروع حقيقي → إغلاق DVL → فتحه → نفس projectId والمجلد الصحيح، دون تغيير ملفات المستخدم.  
**Gate:** دورة المشروع كاملة ومفهومة، لا خلط بين مشروعين.

## المرحلة 05 — Durable Store والهوية والأحداث

**الحالة:** توجد قوانين وآليات Spike؛ نعيد استعمالها ونثبت ربطها بالتطبيق.

- [ ] 05.1 توصيل Event Store المعتمد بدل إنشاء ledger منافس.
- [ ] 05.2 schema/migrations للـprojects/runs/tasks/assignments والأدلة والمراجع اللازمة.
- [ ] 05.3 هوية DVL لكل فعل وربطه بالـattempt والـworkspace والـbasis.
- [ ] 05.4 حفظ القرارات المهمة قبل الاستمرار وفق عقد Core.
- [ ] 05.5 projector للحالة من المصدر المعتمد؛ UI cache ليس مصدر حقيقة.
- [ ] 05.6 فشل DB/disk/full/corruption: منع continuation الذي لا يمكن تسجيله بأمان.

**الاختبار:** kill/restart أثناء transitions؛ حفظ الأحداث وترتيبها وإعادة بناء الحالة.  
**Gate:** موت التطبيق لا يمحو تاريخ العمل ولا يُنشئ انتقالًا غير مسجل.

## المرحلة 06 — Secrets وAuthorization

- [ ] 06.1 secure storage للـAPI keys على المنصة المختارة.
- [ ] 06.2 منع secrets من logs/events/evidence/model context.
- [ ] 06.3 تطبيق قرارات Kernel: allow/block/ask وفق العقد الفعلي.
- [ ] 06.4 انتظار المستخدم دون stream deadlock؛ رفض أو إلغاء أو استئناف مضبوط.
- [ ] 06.5 approval محدد النطاق، مع revalidation بعد restart وتغير basis.
- [ ] 06.6 repository hooks/config وتعليمات الملفات ليست permission.

**الاختبار:** fake secret في logs؛ ask ثم deny؛ restart أثناء approval؛ config يحاول توسيع السلطة.  
**Gate:** لا تسريب ولا موافقة عامة صامتة، ولا Worker يمنح نفسه صلاحية.

## المرحلة 07 — Kernel + Transaction Workspace + Isolation

**الحالة:** أساس القانون موجود؛ binding المنتج يحتاج إثباتًا.

- [ ] 07.1 Worker writes داخل worktree أو staging معزول، لا مباشرة في Project Truth.
- [ ] 07.2 فحص canonical paths/parents/symlink traversal وحدود workspace.
- [ ] 07.3 حماية الملفات المحظورة والأسرار والأفعال الخارجة عن scope.
- [ ] 07.4 fencing للـstale/dead attempt والنتائج المتأخرة.
- [ ] 07.5 Supervisor يملك process groups وموارد التنفيذ.
- [ ] 07.6 عزل runtime/network بالمستوى الذي يتطلبه الدور؛ الدور المقيد دون sandbox حقيقي لا يأخذ shell.

**الاختبار:** كتابة خارج المشروع، symlink escape، stale identity، وprocess يحاول تجاوز حدود الدور.  
**Gate:** المنع enforced في النظام؛ blacklist للأوامر أو prompt وحدهما لا يكفيان.

## المرحلة 08 — قراءة المشروع وContext الأدنى

- [ ] 08.1 list/read/find/search بأحجام ووقت محددين.
- [ ] 08.2 ignore rules للـgenerated/dependencies/binaries/secrets.
- [ ] 08.3 framework/language/test-command detection الأولي.
- [ ] 08.4 إرجاع path/version/hash لمحتوى القراءة عند الحاجة للتحقق من currentness.
- [ ] 08.5 context selection أولي مع حدود payload؛ لا إرسال repo كامل تلقائيًا.

**الاختبار:** repo حقيقي يحتوي ملفات كبيرة وأسرار وملفات ignored.  
**Gate:** يجد الملفات المطلوبة ويحترم الحدود ويعرف مصدر كل محتوى.

## المرحلة 09 — Patch Engine آمن

- [ ] 09.1 create/patch/write/delete وفق Kernel.
- [ ] 09.2 التحقق من hash/currentness قبل تعديل نسخة قرأها Worker.
- [ ] 09.3 atomic writes ومنع half-written file عند الانقطاع.
- [ ] 09.4 diff وundo/rollback داخل النطاق، دون محو تغييرات المستخدم الأخرى.
- [ ] 09.5 syntax checks مناسبة للـstack المدعوم؛ عدم تعميم parser واحد على كل اللغات.
- [ ] 09.6 اكتشاف concurrent human edit وطلب إعادة القراءة أو rework.

**الاختبار:** تعديل المستخدم بين read وpatch؛ patch غير صالح؛ crash أثناء الكتابة.  
**Gate:** لا silent overwrite ولا corruption؛ التعديل يتحول إلى Candidate قابل للفحص.

## المرحلة 10 — Terminal وProcess Supervisor

- [ ] 10.1 execute بصيغة وأدوات محددة تحت sandbox/authority.
- [ ] 10.2 stdout/stderr/exit code/duration مع limits.
- [ ] 10.3 timeout/cancel/kill process group ومنع subprocess orphan.
- [ ] 10.4 تصنيف command قبل التنفيذ وعدم تنفيذ فعل mutating مرتين.
- [ ] 10.5 environment وworking directory وnetwork boundaries تحت DVL.
- [ ] 10.6 تصنيف النتيجة المجهولة بعد الانقطاع؛ لا blind retry لفعل غير idempotent.

**الاختبار:** command يعلق، يطبع بلا نهاية، ينشئ children، أو يموت قبل وصول result.  
**Gate:** DVL يوقف الفعل ويعرف حدوده؛ وجود terminal قابل للتشغيل لا يكفي دون containment.

## المرحلة 11 — Git وSnapshot للمشروع

- [ ] 11.1 status/diff/log وbaseline قبل العمل.
- [ ] 11.2 حفظ تغييرات المستخدم الموجودة مسبقًا وعدم اعتبارها عمل Worker.
- [ ] 11.3 worktree أو بديل staging مضبوط للمشروع غير Git.
- [ ] 11.4 changed-file capture وربطه بالمهمة والـcandidate.
- [ ] 11.5 rollback محدود مع تقرير ما الذي تم التراجع عنه.

**الاختبار:** dirty repo قبل المهمة؛ مشروع غير Git؛ تغيير المستخدم أثناء run.  
**Gate:** نعرف ما تغيّر بسبب DVL وما كان موجودًا، دون فقدان عمل المستخدم.

## المرحلة 12 — Tests/Build وبيئة التشغيل المعزولة

- [ ] 12.1 اكتشاف test/lint/typecheck/build scripts من stack المدعوم.
- [ ] 12.2 تثبيت package commands تحت السياسة؛ package scripts كود يحتاج containment.
- [ ] 12.3 DB/cache/temp dirs وenv معزولة للتجارب mutating.
- [ ] 12.4 capture للـcommand والـexit والمخرجات والـcandidate/basis/environment.
- [ ] 12.5 تمييز test failure عن missing dependency أو infrastructure failure أو no tests.

**الاختبار:** failing test حقيقي، dependency ناقصة، migration في DB تجريبية.  
**Gate:** فحص يمكن إعادته وأثره واضح؛ لا إصابة DB المستخدم الأصلي بالتجربة.

## المرحلة 13 — Dev Server وLive Product أولي

- [ ] 13.1 start/observe/stop server وإدارة ports/process identity.
- [ ] 13.2 كشف URL مع health check؛ log يقول started لا يكفي.
- [ ] 13.3 عرض validated checkpoint أو stable staging preview اجتاز الفحوص المناسبة.
- [ ] 13.4 الفصل البصري بين working Candidate ونسخة integrated.
- [ ] 13.5 browser/embedded preview boundaries؛ صفحة المشروع لا تستعمل privileged desktop bridge.
- [ ] 13.6 browser journey أولي أو طريقة تفاعل محددة؛ URL Live ليست صورة فقط.

**الاختبار:** port collision، server crash، candidate نصف مكتوب، تفاعل مستخدم حقيقي.  
**Gate:** النتيجة تعمل فعلًا وتُعرض من نسخة محددة وآمنة.

## المرحلة 14 — Evidence → Verification → Integration للـMVP

**الحالة:** قانون وتجارب محدودة موجودة؛ الربط العام بالمنتج ناقص الإثبات.

- [ ] 14.1 candidate محدد مع hashes/basis/decision versions.
- [ ] 14.2 EvidenceRecords DVL-owned؛ provider claims لا تتحول تلقائيًا إلى دليل.
- [ ] 14.3 verdict: PASS/FAIL/INSUFFICIENT_EVIDENCE مربوط بالأدلة.
- [ ] 14.4 fail → rework؛ تغير candidate يبطل applicable evidence المتأثر.
- [ ] 14.5 Integration يعيد التحقق من authority/basis/current decisions/blockers.
- [ ] 14.6 نشر local Project Truth بشكل ذري أو recoverable، دون overwrite لتعديل أحدث.
- [ ] 14.7 «Worker finished; verification waiting» حالة منفصلة عن integrated.

**الاختبار:** fake PASS، evidence لنسخة قديمة، تغير الملفات قبل Integration، crash أثناء النشر.  
**Gate:** لا Official Truth من Worker أو UI؛ فقط Integration المقبول يغيرها.

## المرحلة 15 — Checkpoints قبل التشغيل الذاتي

- [ ] 15.1 task/run/attempt/workspace/decision basis محفوظة.
- [ ] 15.2 completed actions، remaining work، tool outcomes وcandidate refs.
- [ ] 15.3 mechanical checkpoint مصنف SAFE/UNSAFE؛ checkpoint ليس Project Truth.
- [ ] 15.4 unresolved effects تمنع continuation غير الآمن.
- [ ] 15.5 quiescence/stop authority قبل resume؛ الأجزاء غير المكتملة تحفظ للتشخيص.
- [ ] 15.6 بروتوكول مبدئي: pause → save → revoke/fence → classify → fresh authority عند العودة.

**الاختبار:** pause أثناء patch أو command، ثم إعادة فتح الحالة دون أي model.  
**Gate:** استمرار العمل لا يعتمد على الذاكرة الخاصة للـProvider، ولا يُعيد authority قديمة.

## المرحلة 16 — ربط الأدوات بدون LLM

- [ ] 16.1 Tool Registry بعقود inputs/outputs وأسماء وإصدارات.
- [ ] 16.2 mock controller يفتح repo، يقرأ، يعدل Candidate، ويشغل tests.
- [ ] 16.3 يمر عبر Evidence/Verification/Integration ولا يقفز عليها.
- [ ] 16.4 يبدأ النسخة المقبولة في Live Product ويوقفها.
- [ ] 16.5 إعادة تشغيل وفحص snapshot/events/checkpoints.

**الاختبار:** happy path ثم failure في كل boundary مهم.  
**Gate:** سلسلة Desktop→Core→Tools→Evidence→Preview تعمل دون glue يدوي. لا ندخل model لتعويض خلل runtime.

## المرحلة 17 — Provider API حقيقي واحد

- [ ] 17.1 ModelProvider interface وأول adapter مع capabilities صريحة.
- [ ] 17.2 API auth من secure storage؛ اختيار provider بالتجربة والوثائق الرسمية وقت التنفيذ.
- [ ] 17.3 streaming، parsing، tool requests وإرجاع tool result.
- [ ] 17.4 اختيار execution mode صريح؛ `dvl_tools` نقطة البداية المقترحة.
- [ ] 17.5 cancellation/error normalization/session identity.
- [ ] 17.6 لا التنفيذ من Provider وDVL للفعل نفسه، ولا قبول tool مجهول.

**الاختبار:** prompt → real API → tool request → DVL action → tool result → model continuation.  
**Gate:** مسار كامل دون copy/paste أو human glue، مع malformed response/cancel test.

## المرحلة 18 — Usage/Budget/Network Limits

- [ ] 18.1 usage labels: reported/estimated/unknown، دون تكلفة مخترعة.
- [ ] 18.2 limits للوقت، turns، tool calls، bytes، retries وno-progress.
- [ ] 18.3 الإشارات المتاحة فعلًا من provider؛ لا ادعاء معرفة quota المتبقي إذا API لا يرسله.
- [ ] 18.4 bounded retries للأفعال الآمنة؛ غموض نتيجة الفعل mutating لا يعالج بإعادته.
- [ ] 18.5 network loss/rate limit/quota exhaustion → pause/checkpoint أو حالة توقف صحيحة.
- [ ] 18.6 سياق يتضخم → context management أو handoff مضبوط، لا محو requirement.

**الاختبار:** انقطاع الشبكة، rate limit، نهاية budget، stream يعلق.  
**Gate:** لا retry storm ولا runaway spending؛ العمل محفوظ والسبب ظاهر.

## المرحلة 19 — Single-Worker Coding Loop

- [ ] 19.1 User request يصبح Task Contract محدودًا وهوية وbasis معلومين.
- [ ] 19.2 inspect → reason → permitted tool → observe → continue.
- [ ] 19.3 edit → tests → diagnose → repair → retest.
- [ ] 19.4 Worker completion claim منفصل عن verdict وIntegration.
- [ ] 19.5 end/stop/fail/no-progress criteria وحدود budget مطبقة.
- [ ] 19.6 final report يطابق diff/evidence ويذكر ما لم يتحقق.

**الاختبار:** طلب feature صغير يتطلب أكثر من ملف؛ عدم تدخل الإنسان لتعديل الكود أثناء run.  
**Gate:** Worker يعمل تلقائيًا من الطلب إلى نتيجة متحققة؛ النجاح مرة واحدة لا يقفل MVP كله.

## المرحلة 20 — تدخل المستخدم وInputs والوضوح

- [ ] 20.1 Chat يتصل بالـrun الحالي دون خلط الرسائل بين مشاريع/attempts.
- [ ] 20.2 Stop/Pause/Cancel يعمل في UI وفي runtime.
- [ ] 20.3 تعديل requirement يسجل version؛ run المتأثر يتوقف أو يعاد تقييمه بسلطة جديدة.
- [ ] 20.4 upload نصوص/خطط/صور للـMVP مع فحص الحجم والنوع وسياسة البيانات.
- [ ] 20.5 Activity من الأفعال الفعلية، مع terminal/diff/result واضح.
- [ ] 20.6 user instructions داخل ملفات أو صور ليست موافقة أو سلطة.

**الاختبار:** user change وسط run، زر stop وسط command، attachment يحاول تجاوز scope.  
**Gate:** المستخدم يتحكم؛ لا استمرار صامت بالطلب القديم ولا progress وهمي.

## المرحلة 21 — Recovery فعلي لنفس Worker/Provider

- [ ] 21.1 kill app/worker/adapter في نقاط محددة من التنفيذ.
- [ ] 21.2 إعادة بناء الحالة من store والملفات والأدلة، لا session memory وحدها.
- [ ] 21.3 مقارنة الوضع الحالي مع checkpoint وإظهار unresolved actions.
- [ ] 21.4 fresh attempt/authority بعد revalidation؛ stale attempt يبقى ممنوعًا.
- [ ] 21.5 resume/discard/diagnostic archive مع المحافظة على عمل المستخدم.
- [ ] 21.6 التعامل مع processes/ports وDB التجريبية بعد restart.

**الاختبار:** موت قبل وبعد action result، وأثناء Verification وIntegration، ثم resume.  
**Gate:** Work survives؛ authority لا تعود تلقائيًا؛ لا فعل غير idempotent يتكرر لمجرد ضياع الرد.

## المرحلة 22 — سلم مشاريع حقيقية وإغلاق Single-Worker MVP

- [ ] 22.1 tiny app: إثبات الحلقة الأساسية.
- [ ] 22.2 small existing repo: feature يلمس UI وpersistence.
- [ ] 22.3 bug-fix repo: failing test واكتشاف السبب وإصلاحه.
- [ ] 22.4 full-stack صغير: frontend/backend/SQLite في runtime معزول.
- [ ] 22.5 repo متوسط داخل نطاق دعم MVP: relevance وcurrentness دون تحميله كله.
- [ ] 22.6 تكرار feature/bug/refactor/steer/cancel/restart على الجهاز المستهدف.
- [ ] 22.7 baseline → autonomous run → trace → diff → tests → live journey → acceptance → failure test → postmortem.
- [ ] 22.8 تصنيف الفشل حسب المالك وإصلاحه ثم إعادة نفس السيناريو، بمراجعة مستقلة للحدود المهمة.

**Gate:** اكتمال متكرر ضمن مجموعة مشاريع ومعايير متفق عليها، دون corruption blockers، مع Kernel/provider/verification/recovery/preview تعمل. هنا فقط نقول: **DVL Single-Worker Desktop MVP CLOSED — GREEN-SCOPED**. لا نقول إن DVL الكامل انتهى.

## المرحلة 23 — Context Engine أقوى للمشاريع المتوسطة

- [ ] 23.1 incremental inventory/index وفق ignores وpolicy.
- [ ] 23.2 symbol/import awareness حيث stack يسمح.
- [ ] 23.3 relevant-file ranking وروابط source provenance.
- [ ] 23.4 budgeting/compaction يحفظ intent/decisions/evidence refs.
- [ ] 23.5 changed-file detection وإبطال context القديم.
- [ ] 23.6 benchmark retrieval quality/latency/memory ضد baseline الـMVP.

**الاختبار:** مشروع متوسط مع ملفات متشابهة وتغيير ملفات أثناء run.  
**Gate:** تحسن مقاس في العثور على relevant code، مع حدود RAM وعدم إرسال أسرار.

## المرحلة 24 — Planning Engine: أربع مراحل بلا اختصار

**الحالة:** التصميم موجود؛ product implementation يحتاج بناء وربط.

- [ ] 24.1 Source Intent Baseline immutable/versioned.
- [ ] 24.2 Normal: explicit requirements/actors/constraints/acceptance فقط.
- [ ] 24.3 Smart: مباشرةً implied dependencies/entities/contracts/consumers مع provenance.
- [ ] 24.4 Ultra: relations/failures/resources/hidden consequences، والتعامل مع missing work.
- [ ] 24.5 Ultra-Pro: مهاجمة assumptions ونتائج Ultra، مع termination/budget واضح.
- [ ] 24.6 قبول revisions وفصل hypotheses عن accepted relations.
- [ ] 24.7 tracing عبر كل stage واختبار intent drift؛ لا حذف feature لأن تنفيذه أصعب.

**الاختبار:** مشاريع بعلاقات معروفة وعلاقات مخفية وأمثلة intent conflicts؛ تقييم كل stage وحده ثم السلسلة.  
**Gate:** نتائج قابلة لإعادة البناء وتتبع أصلها؛ لا claim أن Ultra-Pro يرى كل المجهول. كل مرحلة من الأربع لها sub-gate داخل هذه المرحلة.

## المرحلة 25 — Canonical URG حقيقي

- [ ] 25.1 relation schema/identity/version/source/evidence/confidence/lineage.
- [ ] 25.2 canonical ownership واحد، لا graph سري منافس.
- [ ] 25.3 produce/consume/dependency/resources/conflict/invalidation/gates.
- [ ] 25.4 runtime proposals تمر عبر قبول/revalidation، لا edits صامتة من Worker.
- [ ] 25.5 affected-set وحالة uncertainty؛ unknown لا يعني independent.
- [ ] 25.6 persistence/restart/incremental revision.

**الاختبار:** إضافة وتعديل وحذف relation مصرح به، إعادة تشغيل، cycles وaffected-set.  
**Gate:** لا relation loss ولا divergence بين graph وproject decisions.

## المرحلة 26 — Deterministic Graph-to-Task Compiler

- [ ] 26.1 accepted URG + explicit versioned system rules مدخلات معلومة.
- [ ] 26.2 Task Contracts فيها WHY/inputs/outputs/consumers/scope/acceptance/evidence.
- [ ] 26.3 dependencies/resources/conflicts/WAIT/HOLD/gates/lineage.
- [ ] 26.4 selective relation consumption مع أثر موثق لكل relation relevant.
- [ ] 26.5 deterministic outputs لنفس المدخلات وإعادة compilation للجزء المتأثر.
- [ ] 26.6 لا invent semantic meaning ولا منح authority من compiler.

**الاختبار:** نفس inputs أكثر من مرة؛ unsupported relation؛ relation تغير consumers/ordering.  
**Gate:** projection صادق وقابل للتتبع، دون source semantic ثالث مخفي.

## المرحلة 27 — Task → Assignment → Worker Lifecycle الكامل

**الحالة:** الهوية الأدنى دخلت مبكرًا؛ هنا نوسعها للاستبدال والتوازي.

- [ ] 27.1 state machine canonical واحدة بمالك واضح.
- [ ] 27.2 task durable، assignment revocable، worker replaceable.
- [ ] 27.3 attempts/fencing/delivery correlation حسب عقد Core.
- [ ] 27.4 duplicate/late/out-of-order messages لا تكرر execution.
- [ ] 27.5 reassignment ينتج سلطة جديدة ولا يعيد القديمة.
- [ ] 27.6 controller restart يحافظ على lifecycle دون lost tasks.

**الاختبار:** Worker يموت ويعود بعد تكليف بديل؛ duplicate result وrestart.  
**Gate:** Task لا تضيع ولا تصبح نتيجتان رسميتان من authority متعارضة.

## المرحلة 28 — Risk Hooks ومراجعة مستقلة للقدرات الجديدة

- [ ] 28.1 contract مضبوط للـrisk/control metadata؛ المعمارية الحالية ليست schema نهائيًا.
- [ ] 28.2 تصنيف لا يثق في labels الآتية من Worker.
- [ ] 28.3 required Review/Security controls تمنع المرور إن لم تتوفر.
- [ ] 28.4 تعريف معنى review findings/control completion دون منح LLM authoritative PASS.
- [ ] 28.5 حدود الدور: coding ≠ review ≠ security؛ provider assignment حسب سياسة المشروع.
- [ ] 28.6 high-risk external effects غير المثبتة تبقى blocked/unsupported حتى gate خاص بها.

**الاختبار:** critical task يحاول المرور بلا control؛ fake review PASS؛ تغيير candidate بعد review.  
**Gate:** التوسع لا يتجاوز controls المطلوبة. مراجعة أمن الأساس مستمرة منذ المراحل الأولى؛ هنا تتحول إلى عقود runtime أوسع.

## المرحلة 29 — Multi-Worker صغير وحقيقي

- [ ] 29.1 Workerان أولًا، ثم ثلاثة: frontend/backend/tests أو مهام مناسبة.
- [ ] 29.2 workspace/worktree/authority/resources لكل Worker.
- [ ] 29.3 resource contract للـfiles/ports/processes/DB/runtime.
- [ ] 29.4 collect candidates وأدلة دون direct merge إلى Truth.
- [ ] 29.5 موت Worker أو فشل task لا يوقف branch مستقل بلا سبب.
- [ ] 29.6 per-project CPU/RAM/provider admission limits.

**الاختبار:** مهام مستقلة وأخرى تتعارض على نفس المورد؛ kill أحد Workers.  
**Gate:** لا overwrite أو workspace escape أو authority mix؛ ثلاثة Workers آمنون قبل توسيع العدد.

## المرحلة 30 — Orchestrator V0 deterministic

- [ ] 30.1 جاهزية حسب dependencies وcurrent contracts.
- [ ] 30.2 حالات wait/hold/running/invalid/verification pending وفق state machine المعتمدة.
- [ ] 30.3 admission/resource conflict/capacity/backpressure.
- [ ] 30.4 completion propagation/re-dispatch مع fresh authority من Kernel.
- [ ] 30.5 deadlock/starvation diagnostics وسياسة fairness.
- [ ] 30.6 schedule decisions محفوظة ومفسرة.

**الاختبار:** 50–100 logical Tasks، بعدد Workers يناسب 8 GB، مع exclusive resources.  
**Gate:** لا lost task أو duplicate dispatch أو deadlock غير مفسر؛ Orchestrator لا يتحول إلى Kernel.

## المرحلة 31 — Smart Décalage / Constraint-Driven Flow

- [ ] 31.1 الإيقاع ناتج من readiness والقيود والموارد، لا delay اعتباطي.
- [ ] 31.2 local WAIT/HOLD دون تجميد الفروع غير المتأثرة.
- [ ] 31.3 verification backlog/provider pressure/CPU/RAM تدخل admission.
- [ ] 31.4 إعادة validation للـbasis عند release/availability changes.
- [ ] 31.5 bounded HOLD state وإجراءات cleanup لا تمحو أدلة recovery.
- [ ] 31.6 مقارنة throughput/fairness/useful progress بالـOrchestrator V0.

**الاختبار:** ثلاثة Tasks لنفس المورد، تباطؤ verifier، ضغط RAM وتغير availability.  
**Gate:** التدفق مفيد وآمن ولا يعتمد على timers اعتباطية؛ انتظار مورد لا يساوي تصريحًا عند توفره.

## المرحلة 32 — Dynamic Replanning وتغيير المشروع أثناء العمل

- [ ] 32.1 user change أو runtime discovery يصبح proposal/version معروفًا.
- [ ] 32.2 acceptance ثم URG update وaffected-set.
- [ ] 32.3 fencing للتكليفات المتأثرة قبل استمرار أفعال invalid.
- [ ] 32.4 recompile/reschedule/re-evidence حسب الأثر.
- [ ] 32.5 independent branches تستمر؛ uncertainty تُعالج صراحةً.
- [ ] 32.6 ردود متكررة/متأخرة لا تسبب invalidation storm.

**الاختبار:** تغيير DB وسط run، hidden dependency، conflict لا يعرفه graph سابقًا.  
**Gate:** الاستجابة صحيحة ومحددة النطاق؛ لا ادعاء أن graph يرى كل conflict مسبقًا.

## المرحلة 33 — Multi-Provider وWorker Handoff

- [ ] 33.1 adapter ثانٍ وcapability matrix مصرح به.
- [ ] 33.2 token/context/quota/health signals مع unknowns واضحة.
- [ ] 33.3 planned stop → durable handoff → revoke/fence → new assignment/provider.
- [ ] 33.4 goal/decisions/completed actions/remaining work/evidence/checkpoints للمستلم.
- [ ] 33.5 fallback لا يوسع permissions ولا يكشف secrets للـprovider الخطأ.
- [ ] 33.6 budget وإثبات recovery لكل provider، دون الاعتماد على private session.

**الاختبار:** quota/provider death ثم انتقال حقيقي؛ مزود قديم يرجع متأخرًا.  
**Gate:** نفس العمل يستمر بسلطة جديدة، دون duplicate effects أو intent loss.

## المرحلة 34 — Evidence/Verification/Integration تحت التوازي

**الحالة:** الخدمة المحلية دخلت في المرحلة 14؛ هنا نوسع الإثبات.

- [ ] 34.1 exact candidate/basis/evidence applicability لكل branch.
- [ ] 34.2 concurrent candidates وintegration-time revalidation.
- [ ] 34.3 atomic/recoverable publication مع crash points.
- [ ] 34.4 integration conflicts → rebase/rework/reverify، لا force accept.
- [ ] 34.5 external effect adapters: intent/outcome/receipt/reconciliation قبل تفعيلها.
- [ ] 34.6 unresolved remote effect يبقى HOLD؛ لا promise عام بـexactly-once.

**الاختبار:** دليل stale، publish crash، integration race، API نفذت ولم يصل رد.  
**Gate:** Project Truth متسق ضمن القدرات المفعلة؛ كل فئة أثر خارجي جديدة تحتاج gate خاصًا قبل الاستعمال.

## المرحلة 35 — Review / Security / Audit كمنتج

- [ ] 35.1 task-level review مرتبط بالـcandidate والـconsumers.
- [ ] 35.2 security controls حسب المخاطر، لا نفس الطقوس لكل typo.
- [ ] 35.3 review/security roles مستقلة ونطاق أدوات محدود.
- [ ] 35.4 module audit ثم full-product audit وفق triggers متفق عليها.
- [ ] 35.5 findings → tasks → repair → verification → integration.
- [ ] 35.6 traceability والتكلفة ومنع repeat-review loops دون تغير.

**الاختبار:** bug مقصود وثغرة ومشكلة contract؛ false PASS وfalse FAIL وinsufficient evidence.  
**Gate:** controls المطلوبة تمنع promotion؛ audit يستطيع إعادة بناء القصة من الأدلة، ولا يمنح نفسه execution authority.

## المرحلة 36 — Skills / Toolbox / MCP / Git Import

- [ ] 36.1 skill installation/version/provenance/scope؛ skill text لا يوسع authority.
- [ ] 36.2 external tool adapters/schema/capability/identity تحت Kernel.
- [ ] 36.3 connect/disconnect/auth/revoke للـtools المدعومة فقط.
- [ ] 36.4 MCP outputs untrusted، وإدارة secrets/network/external writes.
- [ ] 36.5 Git clone/import مع credentials وdirty/error/partial clone handling.
- [ ] 36.6 packaging وtimeouts/cancellation/checkpoints للقدرات الجديدة.

**الاختبار:** tool server يموت أو يعيد instruction injection؛ repo hooks؛ revoke أثناء run.  
**Gate:** الإضافة لا تصبح طريقًا جانبيًا لتجاوز القانون. كل connector مؤثر خارجي يمر بمرحلة 34 المناسبة.

## المرحلة 37 — Dynamic Project Environment والـRooms

- [ ] 37.1 Project Hub وsidebar وrooms بتجربة المنتج المثبتة.
- [ ] 37.2 Meeting/Chat يعرض قرارات المشروع وتغييراتها.
- [ ] 37.3 Live Tasks يعرض task/assignment/worker/current action والانتظار الفعلي.
- [ ] 37.4 Live Product يعرض checkpoint صحيحًا مع run/stop/interact.
- [ ] 37.5 Design Room بصري فقط: see → ask → refine → accept؛ لا backend/DB/auth أو executable behavior authority.
- [ ] 37.6 ذاكرة design: قاعدة عامة للمشروع واستثناء component محدد.
- [ ] 37.7 Export Component: visual intent/artifact مقبول → normal coding pipeline → checks → Integration؛ لا direct code promotion من Design.
- [ ] 37.8 restart يعيد rooms من durable runtime truth.

**الاختبار:** تصميم homepage/export، طلب DB change داخل Design، Worker يتوقف وUI يتحدث.  
**Gate:** كامل التجربة مرتبط بالنظام الحقيقي؛ قبول visual لا يثبت code correctness.

## المرحلة 38 — عدة مشاريع وحدودها

- [ ] 38.1 project-specific state/roles/providers/skills/tools/decisions.
- [ ] 38.2 switch/minimize/return دون خلط streams/actions.
- [ ] 38.3 background execution policy واضحة للمستخدم.
- [ ] 38.4 global machine admission مع per-project fairness.
- [ ] 38.5 secrets/workspaces/ports/evidence معزولة بين المشاريع.
- [ ] 38.6 close/delete/archive لا يترك عمليات أو يمحو source المستخدم بالخطأ.

**الاختبار:** مشروعان أو ثلاثة مع فشل أحدها وتبديل UI وrestart.  
**Gate:** مشروع لا يملك سلطة على آخر، والعمل المشترك على الجهاز لا يسبب انهيارًا غير مضبوط.

## المرحلة 39 — Scale وLong Runs على 8 GB

- [ ] 39.1 قياس RAM/CPU/disk/latency/event-store/context/provider cost.
- [ ] 39.2 small → medium → larger → sustained runs.
- [ ] 39.3 زيادة logical tasks تدريجيًا: 10 ثم 50 ثم 100 ثم 400–500 إذا القياسات تسمح.
- [ ] 39.4 التمييز بين logical task count وactive workers؛ لا 500 process على 8 GB لمجرد وجود 500 Tasks.
- [ ] 39.5 crash/internet loss/token exhaustion/resource conflicts/graph misses/user change.
- [ ] 39.6 second run بنفس الحمل لكشف leaks وstate contamination.
- [ ] 39.7 bounded logs/GC/retention مع Recovery Barrier وعدم حذف evidence حي.

**Gate:** حدود تشغيل مقاسة ومعلنة، وتراجع admission عند الضغط بدل corruption. Simulator دليل على منطقه فقط؛ runtime tests هي دليل runtime.

## المرحلة 40 — التوزيع والمنصات والإصدار

- [ ] 40.1 installer/build/signing/notarization لمنصة macOS وفق المتطلبات السارية وقت التنفيذ.
- [ ] 40.2 first-run onboarding وprovider setup وunsupported cases مفهومة.
- [ ] 40.3 update/migration/backup/rollback دون فقد state أو secrets.
- [ ] 40.4 privacy/data-flow/retention/telemetry/support diagnostics محددة؛ secure data handling قائم منذ البداية.
- [ ] 40.5 terms/provider constraints/license review قبل توزيع المنتج؛ فحص المصادر الرسمية عند التنفيذ.
- [ ] 40.6 مراجعة أمن نهائية، regression، real-user acceptance وحل blockers.
- [ ] 40.7 Windows/Linux إن دخلا release scope: isolation/process/filesystem/secret storage tests خاصة بكل منصة.
- [ ] 40.8 release candidate ثم اختبار clean install/update/uninstall وقرار إصدار موثق.

**Gate:** الإصدار جاهز ضمن المنصات والقدرات المثبتة فقط. نجاح macOS لا يمنح GREEN لـWindows/Linux. إنهاء Single-Worker MVP لا يغلق هذه المرحلة تلقائيًا.

## 5. آلية متابعة التنفيذ

نستعمل نفس النموذج لكل مرحلة ولكل نقطة مهمة:

| الحقل | المطلوب |
|---|---|
| Phase / point | مثال: 09 / 09.2 |
| Status | TODO / REUSE / IN_PROGRESS / BLOCKED / REWORK / CLOSED |
| Scope | platform، stack، capability والحدود |
| Owner | مسؤول التنفيذ؛ ومسؤول المراجعة عند الحاجة |
| Artifact | code/document/schema/protocol المنفذ |
| Evidence | commit + test/log/candidate refs + environment |
| Failure scenario | الحالة التي حاولت كسر السلوك |
| Open blockers | نقص محدد، مع أثره على Gate |
| Close decision | من قرر الإغلاق وعلى أي دليل |
| Next dependency | النقطة التالية التي أصبحت ممكنة |

صيغة التسليم بعد كل مرحلة:

«المرحلة X: CLOSED ضمن نطاق Y. النقاط المنجزة: … الاختبارات: … فشل التجربة وكيف عولج: … الأدلة: … لا يوجد blocker داخل النطاق. المرحلة التالية: Z.»

أو:

«المرحلة X: BLOCKED/REWORK. السبب: … النقطة التي لم تنجح: … الإصلاح التالي: … لا نغلق المرحلة التابعة لها قبل الحل.»

لا نضع مدة شهر أو عام كمعيار صحة. مدة الإنجاز تُقدّر بعد معرفة الكود والفريق ونتائج المراحل؛ الإغلاق مرتبط بالدليل.

## 6. أول جلسة عمل بالضبط

1. نستخرج المرجع التنفيذي الحالي: repo/commit/Core V2/logs.
2. نملأ مرحلة 00: ما الموجود القابل لإعادة الاستعمال، وما هو مجرد تجربة أو تصميم.
3. نحل أي blocker يمنع نطاق MVP؛ القدرات الأخرى غير المثبتة تبقى غير مفعلة.
4. نثبت مرحلة 01: macOS/8 GB/stack/narrow task contract/provider واحد.
5. نبني repo وDesktop Shell وOpen Folder بالترتيب.
6. نواصل بقية المراحل دون bypass أو إعلان نجاح غير مثبت.

الهدف القريب هو المرحلة 22: MVP حقيقي. الهدف النهائي هو إغلاق بقية الخريطة حتى Dynamic DVL قابل للتوزيع.

## 7. مصادر الخريطة وحدودها

- `DVL_SCIENTIFIC_BUILD_MAP_CURRENT_POSITION_V1(1).md`: الوضع الأحدث المنقول وترتيب المنتج المقترح، بما فيه Core V2 وTeamspace.
- `DVL_MASTER_PROJECT_STATE_V1_AR.md`: تجربة المنتج الأساسية؛ تعريف وليس إثبات تنفيذ.
- `DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md`: identities، command execution modes، isolation، No Sandbox/No Shell، evidence، Verification/Integration، checkpoints، limits، secrets وحدود preview.
- `H1-solved.txt`: checkpoint تاريخي لـH1.
- `__________________DVL.md`: continuous constraint-driven flow وحدود Farmer/Kernel/Orchestrator.
- `DVL_ARCHITECTURE_CONSOLIDATION_V1_SEMANTIC_V1_TO_V7(1).md`: traceability، local invalidation، recovery، exact candidates وevidence-strength limits.
- `DVL_INPUT_TO_EXECUTION_PIPELINE_V0_1.md`: Normal/Smart/Ultra/Ultra-Pro، canonical URG، deterministic compiler ومسار feedback.
- مقاطع الحالة في `DVL_MASTER_STATE_UPDATE_2026-10-08.md`: حدود الحالة التاريخية لـH4 قبل التقرير الأحدث.
- `DVL_SECURITY_REVIEW_AUDIT_INDIVIDUAL_PLUS_MASTER_STATE_2026-10-11(1).md`: risk/control direction، open implementation questions، review/security/audit وDesign Room visual-only boundary.

البحوث المرفقة الأخرى تحفظ كمواد دعم للمراحل المختصة؛ هذه الوثيقة لا تدعي إعادة التحقق من كل مصادرها أو نتائجها. لم أقم في هذا العمل بتشغيل repo DVL أو استدعاء Provider أو إنشاء تطبيق؛ المنجز هو خريطة تنفيذ ومراجعة ترتيب الاعتماد بين المراحل.

التغييرات المهمة عن V1: إضافة Gate للأدلة الحالية؛ تقديم context/patch reliability الأدنى، isolation، Evidence/Verification/Integration وcheckpoints قبل أول Worker؛ فصل MVP عن اكتمال DVL؛ إبقاء product Security/Audit المتقدم لاحقًا مع أمن الأساس منذ البداية؛ وإضافة Skills/Toolbox/Git import/multi-project/release كقدرات صريحة.
