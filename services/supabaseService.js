const { createClient } = require("@supabase/supabase-js");

const supabaseClient = createClient(
  process.env.API_URL,
  process.env.PUBLIC_KEY
);

const getScoreForUser = async (userId) => {
  const { count } = await supabaseClient
    .from("baths")
    .select("*", { count: "exact" })
    .eq("user_slack_id", userId);
  return count;
};

exports.getScoreForUser = getScoreForUser;
