import dotenv from "dotenv";
import mongoose from "mongoose";
import { MedicalEnglishLesson } from "../models/MedicalEnglishLesson";

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is missing");

  await mongoose.connect(uri);

  await MedicalEnglishLesson.findOneAndUpdate(
    { title: "Today's chunk - Pain quality" },
    {
      $set: {
        title: "Today's chunk - Pain quality",
        category: "Pain quality",
        description: "وصف الألم: pairs of similar English pain-quality terms, with Arabic meaning, patient wording, clarification questions, and traps.",
        status: "draft",
        pairs: [
          {
            first: {
              word: "Sharp",
              arabicMeaning: "ألم حاد، محدد المكان، مثل السكين لكن سريع.",
              explanation: '"Sharp" is usually a clear, localized, quick cutting pain. Use it when the patient says the pain is حاد without stronger stabbing imagery.',
              patientPhrases: '"وجع حاد" بدون تفاصيل → sharp.',
            },
            second: {
              word: "Stabbing",
              arabicMeaning: "طعن، إحساس إن حاجة بتتغرز جوا. أقوى وأعنف.",
              explanation: '"Stabbing" feels like something is being driven into the body. It is stronger and more violent than sharp.',
              patientPhrases: '"وجع زي السكينة" / "حاسس حاجة بتخز" / "بتغرز" → stabbing.',
            },
            difference: "Sharp can be quick and localized. Stabbing has a repeated or forceful piercing feeling, like طعن or something digging in.",
            clarify: '"بيخز مرة واحدة ولا بيتكرر؟" — repeated = stabbing.',
            warning: "",
          },
          {
            first: {
              word: "Dull",
              arabicMeaning: "ألم خفيف، مش واضح مكانه بالظبط، موجود بس مش قوي.",
              explanation: '"Dull" is low-intensity, vague, and not sharply localized.',
              patientPhrases: '"مش وجع قوي بس حاسس بيه" / "حاجة تقيلة" → dull.',
            },
            second: {
              word: "Aching",
              arabicMeaning: "وجع ممل، متواصل، بيتعب العضلة أو المكان.",
              explanation: '"Aching" is a continuous sore tired pain, often muscle-like or exhausting.',
              patientPhrases: '"وجعان وتعبان من الوجع" / "بيوجعني على طول ومكسّرني" → aching.',
            },
            difference: "Dull describes low clarity or low intensity. Aching describes continuous, tiring soreness.",
            clarify: "",
            warning: "",
          },
          {
            first: {
              word: "Throbbing",
              arabicMeaning: "نبض مع ضربات القلب.",
              explanation: "Pain that pulses with the heartbeat. Common with abscesses, migraine, inflamed tooth, or swelling.",
              patientPhrases: '"بينبض" / "حاسس نبض في مكان الوجع" / "زي دقات القلب" → throbbing.',
            },
            second: {
              word: "Pounding",
              arabicMeaning: "نبض أقوى وأتقل، بيدوّخ.",
              explanation: "A heavier, stronger beating sensation, often used for a severe headache.",
              patientPhrases: '"دماغي هتتفرقع" / "نبض قوي بيخبط في راسي" → pounding.',
            },
            difference: "Throbbing is pulse-like. Pounding is stronger, heavier, and more forceful.",
            clarify: "",
            warning: "",
          },
          {
            first: {
              word: "Burning",
              arabicMeaning: "حرقان مستمر.",
              explanation: "A persistent burning sensation. Common with acid reflux, urinary symptoms, or nerve pain.",
              patientPhrases: '"حرقان" / "حاسس نار" / "بيحرقني" → burning.',
            },
            second: {
              word: "Stinging",
              arabicMeaning: "وخز سطحي سريع، زي قرصة.",
              explanation: "A quick surface-level sting, often skin/wound related.",
              patientPhrases: '"بيلسع" / "وخزة" / "قرصة" → stinging.',
            },
            difference: "Burning is usually more continuous. Stinging is quick, sharp, and often superficial.",
            clarify: "If the patient says بيقرص, clarify whether it is on the skin/wound or deeper inside.",
            warning: '"بيقرص" can be stinging or pinching. Skin/wound context → stinging. Inside the body → clarify.',
          },
          {
            first: {
              word: "Shooting",
              arabicMeaning: "ألم بيجري بسرعة على خط، زي كهربا.",
              explanation: "A fast pain traveling along a line, often nerve-like. Sciatica is a classic example.",
              patientPhrases: '"زي الكهربا نازلة في رجلي" / "بيجري" / "بينزل بسرعة" → shooting.',
            },
            second: {
              word: "Radiating",
              arabicMeaning: "بينتشر من نقطة لبرا، أبطأ وأوسع.",
              explanation: "Pain spreading outward from one point. It may suggest referred pain, such as cardiac pain going to jaw/arm.",
              patientPhrases: '"الوجع بيوصل" / "بينتشر" / "بيمتد من صدري لدراعي" → radiating.',
            },
            difference: "Shooting often suggests nerve pain moving fast in a line. Radiating means spreading from a source to another area and may suggest referred pain.",
            clarify: "",
            warning: "Important for the doctor: shooting may point to nerve pain; radiating may point to referred pain.",
          },
          {
            first: {
              word: "Tender",
              arabicMeaning: "بيوجع لما تلمسه أو تضغط عليه.",
              explanation: 'Use when pain is triggered by touch or pressure. Doctors often say "tender on palpation."',
              patientPhrases: '"لما بضغط عليه بيوجعني" / "ميحبش اللمس" → tender.',
            },
            second: {
              word: "Sore",
              arabicMeaning: "بيوجع من نفسه، خصوصًا بعد مجهود.",
              explanation: "A general soreness or body/muscle pain, often after effort or strain.",
              patientPhrases: '"وجعان لوحده" / "مكسّر" / "عضلاتي وجعاني من امبارح" → sore.',
            },
            difference: "Tender depends on touch/pressure. Sore can hurt by itself and is commonly used for muscles or post-effort pain.",
            clarify: '"بيوجعك لما تلمسه بس ولا طول الوقت؟"',
            warning: 'Common trap: if patient says "ملتهب" or "وجعان", do not assume tender. Ask whether touch/pressure triggers it.',
          },
        ],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await mongoose.disconnect();
  console.log("Seeded: Today's chunk - Pain quality");
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
