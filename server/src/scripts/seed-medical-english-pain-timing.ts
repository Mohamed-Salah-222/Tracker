import dotenv from "dotenv";
import mongoose from "mongoose";
import { MedicalEnglishLesson } from "../models/MedicalEnglishLesson";

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is missing");

  await mongoose.connect(uri);

  await MedicalEnglishLesson.findOneAndUpdate(
    { title: "Day 2 - Pain timing & pattern" },
    {
      $set: {
        title: "Day 2 - Pain timing & pattern",
        category: "Pain timing",
        description: "توقيت ونمط الألم: questions doctors ask after pain quality - when it started, whether it is constant, recurring, sudden, gradual, or worsening.",
        status: "draft",
        pairs: [
          {
            first: {
              word: "Acute",
              arabicMeaning: "حديث، بدأ من فترة قصيرة. غالبًا أقل من 3-6 شهور. حاد بمعنى جديد، مش بمعنى قوي.",
              explanation: '"Acute" describes duration/onset, not necessarily intensity. It means recent or short-term.',
              patientPhrases: '"من امبارح" / "من كام يوم" / "فجأة" → acute.',
            },
            second: {
              word: "Chronic",
              arabicMeaning: "مزمن، مستمر لفترة طويلة. غالبًا أكتر من 3-6 شهور.",
              explanation: '"Chronic" means long-lasting or ongoing over a long period.',
              patientPhrases: '"من سنين" / "من زمان معايا" / "مزمن" → chronic.',
            },
            difference: "Acute is about recent onset. Chronic is about long duration. Acute does not mean severe by itself.",
            clarify: '"قصدك الوجع قوي ولا بدأ من فترة قريبة؟"',
            warning: 'Trap كبير: "حاد" بالعربي ممكن تعني strong pain أو recent condition. "وجع حاد" في سياق الشدة → severe/sharp. "مرض حاد" في سياق المدة → acute.',
          },
          {
            first: {
              word: "Constant",
              arabicMeaning: "مستمر بدون انقطاع، نفس الشدة تقريبًا.",
              explanation: "Use this naturally in spoken interpretation when the pain does not stop.",
              patientPhrases: '"على طول" / "مش بيسيبني" / "24 ساعة" / "طول الوقت" → constant.',
            },
            second: {
              word: "Continuous",
              arabicMeaning: "مستمر. قريب جدًا من constant لكن رسمي/طبي أكتر.",
              explanation: "Similar meaning to constant, but often more formal or chart-like in medical context.",
              patientPhrases: "Use continuous when the doctor is speaking formally or documenting.",
            },
            difference: "They are very close. In spoken interpreting, constant often sounds more natural. Continuous sounds more formal/medical.",
            clarify: "",
            warning: "",
          },
          {
            first: {
              word: "Intermittent",
              arabicMeaning: "بيجي ويروح، بدون نمط واضح.",
              explanation: "Pain comes and goes. Timing can be irregular: every few minutes, after hours, or on and off.",
              patientPhrases: '"بيجي ويروح" / "مرة يوجع ومرة لأ" / "على فترات" → intermittent.',
            },
            second: {
              word: "Episodic",
              arabicMeaning: "بيجي في نوبات واضحة، كل نوبة ليها بداية ونهاية، وبينهم فترات ارتياح كاملة.",
              explanation: "Use when the symptom comes in clear episodes or attacks.",
              patientPhrases: '"بييجيلي نوبة" / "بتيجي هجمة وتروح" / "كل فترة بتيجي نوبة قوية" → episodic.',
            },
            difference: "Episodic is clearer and often stronger: distinct attacks with recovery between. Intermittent is broader and lighter.",
            clarify: "هل بييجي كنوبات واضحة ولا بس بيروح ويرجع على فترات؟",
            warning: "Migraine is often episodic. Mild pain that comes and goes is often intermittent.",
          },
          {
            first: {
              word: "Recurrent",
              arabicMeaning: "بيتكرر، بيرجع تاني بعد ما راح.",
              explanation: "General word for something that keeps coming back.",
              patientPhrases: '"بيرجعلي كل شوية" / "اتعالجت ورجع تاني" → recurrent.',
            },
            second: {
              word: "Relapsing",
              arabicMeaning: "بيرجع بعد فترة كان فيها المريض كويس أو متعافي.",
              explanation: "Used more with diseases that improve/remit then come back, such as MS, cancer, depression.",
              patientPhrases: '"كنت كويس وفجأة رجعلي" بعد علاج مرض مزمن → relapsing.',
            },
            difference: "Recurrent means repeated in general. Relapsing means return of disease after improvement/remission.",
            clarify: "هل الموضوع بيتكرر بس، ولا كان فيه تحسن/تعافي وبعدين رجع؟",
            warning: "Do not swap them. Relapsing has a stronger disease-course meaning.",
          },
          {
            first: {
              word: "Sudden",
              arabicMeaning: "فجأة، من غير مقدمات.",
              explanation: "Use when onset is abrupt or all at once.",
              patientPhrases: '"فجأة" / "مرة واحدة" / "وأنا قاعد" → sudden.',
            },
            second: {
              word: "Gradual",
              arabicMeaning: "بالتدريج، بدأ خفيف وزاد مع الوقت.",
              explanation: "Use when onset builds slowly over time.",
              patientPhrases: '"بالراحة" / "شوية شوية" / "بدأ خفيف وزاد" → gradual.',
            },
            difference: "Sudden is abrupt. Gradual develops step by step.",
            clarify: '"بدأ فجأة ولا بالتدريج؟"',
            warning: 'Doctor question: "Did it start suddenly or gradually?" → "بدأ فجأة ولا بالتدريج؟"',
          },
          {
            first: {
              word: "Progressive",
              arabicMeaning: "بيزيد مع الوقت بشكل مستمر. بتوصف مرض بيتطور.",
              explanation: "More clinical. Often describes the course of a disease, such as a tumor or neurological condition.",
              patientPhrases: "Use in disease-course context: مرض بيتطور / الحالة بتتقدم.",
            },
            second: {
              word: "Worsening",
              arabicMeaning: "بيسوء. أعم، ممكن تتقال على عرض واحد أو الحالة كلها.",
              explanation: "General word for getting worse. Can describe pain, symptom, or overall condition.",
              patientPhrases: '"بيزيد يوم عن يوم" / "بيبقى أوحش" → worsening.',
            },
            difference: "Worsening is general. Progressive is clinical and describes disease progression over time.",
            clarify: "هل العرض بس بيسوء، ولا الدكتور بيتكلم عن مرض بيتطور؟",
            warning: "Progressive is stronger and more clinical than worsening.",
          },
        ],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await mongoose.disconnect();
  console.log("Seeded: Day 2 - Pain timing & pattern");
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
