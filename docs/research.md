# Relationshipper: Research Foundation

An evidence brief: the research behind each feature and question theme, and how much weight it can bear. The app shows a plain-language version on its Research page and theme pages, from [`shared/research.ts`](../shared/research.ts); the theme summaries started as [`category-research.json`](./category-research.json).

## Read this first

- **No study has tested Relationshipper itself.** We borrow mechanisms tested in other formats: lab conversations, clinician-led checkups, online programs and diaries. Effects in a light-touch app are likely to be smaller.
- **Much of the evidence is correlational.** Samples also skew white, heterosexual, U.S.-based and married.
- **The app is not therapy.** Couples in serious distress, or where anyone feels unsafe, should be pointed to professional help.

**Strength ratings:**
- **Strong:** meta-analyses or several randomized trials agree.
- **Moderate:** at least one randomized trial, or consistent longitudinal studies.
- **Emerging:** small, single or correlational studies, or clinical frameworks with few direct tests.

---

## Part A: How the app's design follows the research

### 1. Writing answers rather than tapping choices
**Strength:** Moderate for writing in general; Emerging for couples.

In Pennebaker's expressive-writing studies, a few short sessions of writing about emotional experiences were followed by gains in health and well-being (Pennebaker, 1997). Across 146 randomized studies the effect is real but small (*r* = .075; Frattaroli, 2006): a nudge, not a cure.

Two couple studies are closer to how the app works:
- In 86 dating couples, one partner wrote about the relationship for three days. Those couples were more likely to still be together three months later (77% vs. 52%; Slatcher & Pennebaker, 2006).
- In a two-year randomized trial with 120 married couples, three 7-minute sessions spent re-examining a disagreement "from the perspective of a neutral third party who wants the best for all involved" stopped the decline in marital quality that the control group showed (Finkel et al., 2013). A short 2024 pilot trial with 140 parenting couples found the same pattern (Prime et al., 2024).

*In the app:* answers are free text, tips invite feelings and meaning rather than just facts, and conflict prompts can use the neutral-observer reappraisal.

### 2. Both partners answer before either sees
**Strength:** Moderate for the link between disclosure and intimacy. The reveal mechanic itself is untested.

Intimacy builds when partners disclose, especially feelings, and experience each other as responsive. In diary studies, both a person's own disclosure and their partner's predicted how intimate an interaction felt, partly through perceived responsiveness (Laurenceau et al., 1998). Reciprocity matters. Taking turns disclosing produced more liking than one-sided disclosure (Sprecher et al., 2013), and structured, mutual questions built closeness between strangers (Aron et al., 1997).

Prompts also fill a gap. Researchers who filmed newlyweds' everyday life in an apartment lab "saw little self-disclosure, reciprocal or otherwise" (Gottman & Driver, 2005).

Revealing answers only when both partners have written is our own inference from this work, not a tested intervention: it keeps disclosure mutual and each answer independent.

### 3. Writing back with curiosity and enthusiasm
**Strength:** Moderate.

Feeling understood, validated and cared for drives the intimacy process; researchers call this perceived partner responsiveness (Reis & Shaver, 1988). Responses to good news may matter most:
- Enthusiastic, engaged ("active-constructive") responses go with more intimacy and higher daily satisfaction (Gable et al., 2004).
- In 79 dating couples, how partners responded to good news predicted relationship well-being and breakups two months later better than how they responded to bad news (Gable et al., 2006).
- Asking follow-up questions makes people seem more responsive and more likable (Huang et al., 2017). That study involved strangers and speed-daters; a 2025 independent audit corrected minor reporting errors and upheld its conclusions.

One caveat: training people to respond enthusiastically changed how they saw their partner, but did not change reported satisfaction in the short term (Woods et al., 2015). Our tips are scaffolding, not a guarantee.

### 4. A small daily ritual, with an optional gentle reminder
**Strength:** Emerging.

Gottman describes relationships as built from small "bids" for connection, which partners either turn toward or turn away from (Gottman & DeClaire, 2001). In a study of 49 newlywed couples observed at dinner, playfulness and enthusiastic turning toward went with more humor and affection in a later conflict discussion. The authors stress that these data are correlational (Driver & Gottman, 2004). A review of 50 years of research links family routines and rituals with marital satisfaction, though the studies used inconsistent methods (Fiese et al., 2002).

*In the app:* a snuggle is a one-tap bid, and your partner can turn toward it by snuggling back. Nothing tallies them over time, so they can't become a score. Whether a tap does what a bid in person does is untested.

For the reminder: habits form through repetition in a consistent context over weeks to months, and missing a single day did not derail the process (Lally et al., 2010). So reminders come once a day, at a time each partner chooses. Consistency is marked quietly: Today shows "N days in a row" only when both partners have answered the daily question two or more days running, and nothing is shown or sent when a streak breaks.

### 5. Prompts that deepen gradually
**Strength:** Moderate, though mostly from studies with strangers.

Aron et al.'s (1997) "fast friends" procedure uses 36 questions that move from light to personal over 45 minutes, and it produced more closeness than small talk. It is popularly called "36 questions to fall in love," but it measured closeness, not love.

People also overestimate how awkward deep conversations will be. In practice, deep conversations left people more connected than shallow ones (Kardas et al., 2022).

Our three depth levels, Opener, Reflective and Deep, follow this escalation. The daily question stays at Opener for a couple's first 7 days, goes up to Reflective until day 21, and then can come from any depth. This schedule is a design choice informed by the research above; it has not been tested itself.

### 6. Periodic check-ins
**Strength:** Moderate. This rests on one randomized trial of an in-person version.

The Marriage Checkup is an assessment and feedback visit, repeated a year later. In a randomized trial of 215 married couples, it improved intimacy and felt acceptance and reduced distress compared with a wait-list, across two years. The effects were small to moderate (median *d* ≈ .23–.37; Cordova et al., 2014).

That checkup used a clinician and personalized feedback. Our weekly check-in (a Sunday question once a couple has a week of history) borrows its rhythm, not its form, and its effect is untested. Struggling couples have better-tested options, such as the online OurRelationship program, which improved satisfaction compared with a wait-list (*d* = 0.69) in a trial of 300 couples (Doss et al., 2016).

### 7. Stage-specific hypotheticals about moving in, marriage and kids
**Strength:** Moderate. The findings come from large observational datasets, and some are contested.

- **Moving in.** Many couples "slide" into living together without deciding to. This builds inertia that can carry them into marriages they might not otherwise have chosen (Stanley et al., 2006). Couples who moved in before engagement later reported slightly lower marital quality (Rhoades et al., 2009). This "cohabitation effect" is debated, though: much of it reflects how young couples were when they moved in (Kuperberg, 2014).
- **Marriage.** People who make relationship decisions more deliberately report more dedication, more satisfaction and less infidelity (Owen et al., 2013; correlational). Relationship-education programs show moderate gains in experiments: *d* ≈ .30–.36 for relationship quality and .43–.45 for communication (Hawkins et al., 2008). That meta-analysis covers all relationship education, not just premarital programs. For premarital programs specifically, communication improved but relationship quality did not once unpublished studies were included (Fawcett et al., 2010).
- **Kids.** After a first birth, relationship quality dropped suddenly by a small-to-medium amount and stayed lower, while childless couples declined more gradually (Doss et al., 2009). A meta-analysis found that new parents' declines were small and similar to non-parents' (Mitnick et al., 2009). Husbands' fondness and both partners' awareness of each other predicted that mothers' satisfaction would hold steady (Shapiro et al., 2000).

The shared lesson is to talk transitions through in advance; the prompts invite that without promising what a full program delivers.

### 8. A few lines about your day
**Strength:** Moderate for the ingredients; the journal itself is untested.

The journal asks three small things each day, each drawn from research covered elsewhere in this document:
- **Something good.** Enthusiastic, engaged responses to good news go with more intimacy and higher daily satisfaction (Gable et al., 2004), and how partners responded to good news predicted relationship well-being and breakups (Gable et al., 2006).
- **Something hard.** How partners signal stress and support each other is strongly associated with relationship satisfaction (Bodenmann, 2005; Falconier et al., 2015). Stress from outside the relationship makes daily satisfaction react more strongly to everyday ups and downs (Neff & Karney, 2009).
- **Something you appreciated.** Gratitude helps partners notice a responsive partner and draw closer (Algoe, 2012), and appreciation predicted responsiveness, commitment and staying together (Gordon et al., 2012).

On Sundays it also asks for a longer look back at the week, an occasional dose of the expressive writing in section 1 (Pennebaker, 1997). The journal follows the same reveal rule as the questions. Putting these prompts together as a daily journal is our design; no study has tested it.

### 9. Date nights, planned ahead
**Strength:** Emerging.

In three lab experiments, couples who did a novel, challenging 7-minute task together reported a short-term rise in relationship quality compared with couples given a mundane task (Aron et al., 2000). The effect was measured in the lab and in the short term, so it says little about date nights at home over months. A review of 50 years of research links routines and rituals with marital satisfaction, though the studies used inconsistent methods (Fiese et al., 2002).

*In the app:* a shared list of ideas, with starter suggestions that lean toward new things, and a calendar for deciding on a date ahead of time and who's planning it. Planning ahead and taking turns are our design choices; no study has tested them.

### Popular ideas we handle with care

- **The "five love languages."** Chapman's (1992) framework makes three core claims: each person has one preferred "language," there are exactly five, and partners are happier when they match. These claims have limited support (Impett et al., 2024), and direct tests are mixed. Matching added little in a study of 67 couples (Bunt & Hazelwood, 2017) but was linked to satisfaction in a study of 100 couples (Mostova et al., 2022). The app doesn't sort people into types.
- **Divorce "prediction" accuracy.** Figures such as 93% (Gottman & Levenson, 2000) come from models fitted and tested on the same small samples. When such models are tested on new data, accuracy drops sharply (Heyman & Slep, 2001; Stanley et al., 2000). We treat the Four Horsemen as warning signs, not a crystal ball.
- **Viral statistics.** "Couples who stayed together turned toward bids 86% of the time vs. 33%" and "69% of conflicts are perpetual" come from Gottman's books and institute materials. We could not find either in a peer-reviewed paper, so the app doesn't quote them.

---

## Part B: The research behind each question category

### Know Each Other (`love-maps`) · Emerging
Gottman's "love maps" are partners' detailed knowledge of each other's inner world: worries, hopes, friends and history (Gottman & Silver, 1999). It is a clinical concept with few direct tests, so the best support is indirect. In a six-year study of 130 newlywed couples, partners' "awareness" of each other, coded from interviews, predicted that mothers' satisfaction would hold steady or rise after a first baby (Shapiro et al., 2000). People change, so love maps need regular updates.

### Fondness & Admiration (`appreciation`) · Moderate
Gratitude seems to help partners "find, remind and bind": it helps them notice a responsive partner and draw closer (Algoe, 2012). Across diary, observational and longitudinal studies, feeling appreciated and appreciating one's partner went together, and appreciation predicted responsiveness, commitment and staying together (Gordon et al., 2012). In a small study of about 50 couples, fondness and "we-ness" in how couples told their story predicted who stayed together three years later, though the predictions were never tested on new couples (Buehlman et al., 1992).

### Turning Toward (`connection`) · Moderate
Feeling understood, valued and cared for has been proposed as the common thread in research on closeness (Reis et al., 2004). Newlyweds who were playful and turned toward each other enthusiastically at dinner showed more humor and affection in conflict (Driver & Gottman, 2004). People whose partners respond enthusiastically to good news report more intimacy and satisfaction (Gable et al., 2004). This evidence is mostly observational.

### Growth & Adventure (`growth`) · Moderate
Self-expansion theory holds that relationships are rewarding partly because partners broaden each other's identities, skills and perspectives (Aron & Aron, 1986). In three lab experiments, couples who did a novel, challenging 7-minute task together reported a short-term rise in relationship quality compared with couples given a mundane task (Aron et al., 2000). In the "Michelangelo phenomenon," partners who see and treat each other as their ideal selves help each other grow toward those ideals, and these couples function better (Drigotas et al., 1999).

### Conflict & Repair (`conflict`) · Moderate
In Gottman's lab studies, how couples argued predicted later distress and separation, with warning signs including defensiveness, stubbornness, withdrawal and little positive emotion (Gottman & Levenson, 1992). His books name criticism, contempt, defensiveness and stonewalling as the "Four Horsemen." They also describe many recurring conflicts as "perpetual" differences to manage through dialogue rather than solve, a framing that rests more on clinical observation than on controlled tests (Gottman & Silver, 1999). The strongest experimental evidence is a 21-minute reappraisal writing exercise that preserved marital quality for a year (Finkel et al., 2013).

### Emotional Safety (`security`) · Moderate
Adult romantic love has the hallmarks of attachment: people differ in how secure, anxious or avoidant they feel with partners (Hazan & Shaver, 1987). A review by its developers concludes that Emotionally Focused Therapy, which is built on attachment theory, meets the standards for an evidence-based couple therapy (Wiebe & Johnson, 2016). An independent meta-analysis of randomized trials found medium effects at the end of treatment (*g* = 0.73), with possible publication bias (Rathgeber et al., 2019). Our prompts borrow the theme of what helps each partner feel safe and reachable, but they are not therapy.

### Trust & Commitment (`trust`) · Strong for commitment, Moderate for trust
In Rusbult's investment model, commitment grows with satisfaction and investment, and weakens when alternatives look attractive (Rusbult, 1980). Across 52 studies, these factors explained nearly two-thirds of the variation in commitment, and commitment predicted whether couples stayed together (Le & Agnew, 2003). Trust grows in a cycle: seeing a partner make sacrifices or accommodate for the relationship builds trust, and with it the willingness to depend on them (Wieselquist et al., 1999).

### Check-In (`checkin`) · Moderate
A yearly "Marriage Checkup" improved intimacy and acceptance and reduced distress over two years in a randomized trial of 215 couples, with small-to-moderate effects (Cordova et al., 2014). Brief online programs also help couples who are struggling (Doss et al., 2016). Check-ins give couples a regular, low-stakes moment to notice what's working and what needs care.

### Marriage (`marriage`) · Moderate
Commitment has two sides: dedication, which is wanting a future together, and constraint, which is the cost of leaving (Stanley & Markman, 1992). "Sliding" into transitions can build constraint without dedication, which is why talking expectations through before big steps matters (Stanley et al., 2006). Relationship-education programs built around such conversations produce moderate gains on average (Hawkins et al., 2008). Premarital programs specifically show weaker effects on relationship quality (see Part A, section 7).

### Kids & Family (`kids`) · Strong for the small average decline, Moderate for what protects against it
On average, parents report slightly lower marital satisfaction than non-parents (*d* = −0.19), and the gap is largest for mothers of infants (Twenge et al., 2003). After a first birth, relationship quality tends to drop suddenly but modestly and then stay lower (Doss et al., 2009). Husbands' fondness and both partners' awareness of each other early in marriage predicted that mothers' satisfaction would hold steady (Shapiro et al., 2000). That makes a case for talking through hopes, worries and logistics around children early.

### Living Together (`home`) · Moderate
In different-sex couples, women still do most of the housework, and the split is shaped by time available, relative earnings and attitudes about gender (Lachance-Grzela & Bouchard, 2010). Fairness seems to matter more and more. In 2006 survey data, egalitarian couples had sex as often as couples with a conventional split, and the chore split mattered more for sexual satisfaction; neither was true in data from the early 1990s (Carlson et al., 2016). Living together before marriage is linked to lower divorce risk in a marriage's first year but higher risk after that (Rosenfeld & Roesler, 2019).

### Money & Work (`money`) · Moderate
In a national sample of 4,574 couples, financial disagreements predicted divorce more strongly than other disagreements, and financial well-being itself did not predict divorce once disagreements were taken into account (Dew et al., 2012). In home diaries from 100 couples, money was not the most frequent conflict topic, but money conflicts were more pervasive, problematic and recurrent, and more often left unresolved (Papp et al., 2009). Both studies are observational.

### Where We Come From (`origins`) · Moderate
Family patterns echo but don't dictate. In a two-generation national study, parents' discord predicted discord in their adult children's marriages, and the most predictive parental behaviors included jealousy, criticism, anger and not talking to each other (Amato & Booth, 2001). Parental divorce roughly doubled the children's own odds of divorce, apparently because they were less committed to lifelong marriage (Amato & DeBoer, 2001). How close spouses felt to their in-laws early in marriage predicted divorce odds over 16 years, but the pattern differed by gender and race (Orbuch et al., 2013).

### Dreams & Aspirations (`dreams`) · Moderate
When partners support each other's goals responsively, encouraging without intruding, the partner receiving support feels happier, has higher self-esteem and feels more likely to succeed. This showed up in both observational and experimental work (Feeney, 2004). Support for each other's personal goals is also linked to better relationship mood and marital satisfaction (Brunstein et al., 1996).

### Shared Meaning (`meaning`) · Emerging
Shared routines and rituals carry symbolic meaning, and a review of 50 years of research links them with marital satisfaction despite inconsistent methods (Fiese et al., 2002). Couples who see their marriage as sacred, or who share religious practices, report better marital adjustment (Mahoney et al., 1999). That evidence is correlational and comes mostly from religious couples. The app frames meaning broadly, as values, purpose and traditions, whether religious or not.

### Stress & Support (`stress`) · Strong evidence of an association
Dyadic-coping theory describes how partners signal stress to each other, support each other and cope together (Bodenmann, 2005). Across 72 samples covering 17,856 people, dyadic coping was strongly associated with relationship satisfaction (*r* = .45), especially positive and joint coping (Falconier et al., 2015). Stress from outside the relationship also makes daily satisfaction react more strongly to everyday ups and downs (Neff & Karney, 2009). Most of this evidence is correlational.

### Intimacy & Desire (`intimacy`) · Moderate evidence of an association
Couples who talk about sex report better sexual function (Mallory et al., 2019). They also report more relationship satisfaction (*r* = .37) and sexual satisfaction (*r* = .43), and the quality of the talk matters more than how often it happens (Mallory, 2022). In a 21-day diary study of 44 couples, partners motivated to meet each other's sexual needs reported higher desire, which declined less over four months (Muise et al., 2013). The evidence is correlational, and this category stays opt-in.

---

## References

Algoe, S. B. (2012). Find, remind, and bind: The functions of gratitude in everyday relationships. *Social and Personality Psychology Compass, 6*(6), 455–469. https://doi.org/10.1111/j.1751-9004.2012.00439.x

Amato, P. R., & Booth, A. (2001). The legacy of parents' marital discord: Consequences for children's marital quality. *Journal of Personality and Social Psychology, 81*(4), 627–638. https://doi.org/10.1037/0022-3514.81.4.627

Amato, P. R., & DeBoer, D. D. (2001). The transmission of marital instability across generations: Relationship skills or commitment to marriage? *Journal of Marriage and Family, 63*(4), 1038–1051. https://doi.org/10.1111/j.1741-3737.2001.01038.x

Aron, A., & Aron, E. N. (1986). *Love and the expansion of self: Understanding attraction and satisfaction*. Hemisphere. https://openlibrary.org/books/OL2533265M

Aron, A., Melinat, E., Aron, E. N., Vallone, R. D., & Bator, R. J. (1997). The experimental generation of interpersonal closeness: A procedure and some preliminary findings. *Personality and Social Psychology Bulletin, 23*(4), 363–377. https://doi.org/10.1177/0146167297234003

Aron, A., Norman, C. C., Aron, E. N., McKenna, C., & Heyman, R. E. (2000). Couples' shared participation in novel and arousing activities and experienced relationship quality. *Journal of Personality and Social Psychology, 78*(2), 273–284. https://doi.org/10.1037/0022-3514.78.2.273

Bodenmann, G. (2005). Dyadic coping and its significance for marital functioning. In T. A. Revenson, K. Kayser, & G. Bodenmann (Eds.), *Couples coping with stress: Emerging perspectives on dyadic coping* (pp. 33–49). American Psychological Association. https://doi.org/10.1037/11031-002

Brunstein, J. C., Dangelmayer, G., & Schultheiss, O. C. (1996). Personal goals and social support in close relationships: Effects on relationship mood and marital satisfaction. *Journal of Personality and Social Psychology, 71*(5), 1006–1019. https://doi.org/10.1037/0022-3514.71.5.1006

Buehlman, K. T., Gottman, J. M., & Katz, L. F. (1992). How a couple views their past predicts their future: Predicting divorce from an oral history interview. *Journal of Family Psychology, 5*(3–4), 295–318. https://doi.org/10.1037/0893-3200.5.3-4.295

Bunt, S., & Hazelwood, Z. J. (2017). Walking the walk, talking the talk: Love languages, self-regulation, and relationship satisfaction. *Personal Relationships, 24*(2), 280–290. https://doi.org/10.1111/pere.12182

Carlson, D. L., Miller, A. J., Sassler, S., & Hanson, S. (2016). The gendered division of housework and couples' sexual relationships: A reexamination. *Journal of Marriage and Family, 78*(4), 975–995. https://doi.org/10.1111/jomf.12313

Chapman, G. D. (1992). *The five love languages*. Northfield. https://openlibrary.org/books/OL1503025M

Cordova, J. V., Fleming, C. J. E., Morrill, M. I., Hawrilenko, M., Sollenberger, J. W., Harp, A. G., Gray, T. D., Darling, E. V., Blair, J. M., Meade, A. E., & Wachs, K. (2014). The Marriage Checkup: A randomized controlled trial of annual relationship health checkups. *Journal of Consulting and Clinical Psychology, 82*(4), 592–604. https://doi.org/10.1037/a0037097

Dew, J., Britt, S., & Huston, S. (2012). Examining the relationship between financial issues and divorce. *Family Relations, 61*(4), 615–628. https://doi.org/10.1111/j.1741-3729.2012.00715.x

Doss, B. D., Cicila, L. N., Georgia, E. J., Roddy, M. K., Nowlan, K. M., Benson, L. A., & Christensen, A. (2016). A randomized controlled trial of the web-based OurRelationship program: Effects on relationship and individual functioning. *Journal of Consulting and Clinical Psychology, 84*(4), 285–296. https://doi.org/10.1037/ccp0000063

Doss, B. D., Rhoades, G. K., Stanley, S. M., & Markman, H. J. (2009). The effect of the transition to parenthood on relationship quality: An 8-year prospective study. *Journal of Personality and Social Psychology, 96*(3), 601–619. https://doi.org/10.1037/a0013969

Drigotas, S. M., Rusbult, C. E., Wieselquist, J., & Whitton, S. W. (1999). Close partner as sculptor of the ideal self: Behavioral affirmation and the Michelangelo phenomenon. *Journal of Personality and Social Psychology, 77*(2), 293–323. https://doi.org/10.1037/0022-3514.77.2.293

Driver, J. L., & Gottman, J. M. (2004). Daily marital interactions and positive affect during marital conflict among newlywed couples. *Family Process, 43*(3), 301–314. https://doi.org/10.1111/j.1545-5300.2004.00024.x

Falconier, M. K., Jackson, J. B., Hilpert, P., & Bodenmann, G. (2015). Dyadic coping and relationship satisfaction: A meta-analysis. *Clinical Psychology Review, 42*, 28–46. https://doi.org/10.1016/j.cpr.2015.07.002

Fawcett, E. B., Hawkins, A. J., Blanchard, V. L., & Carroll, J. S. (2010). Do premarital education programs really work? A meta-analytic study. *Family Relations, 59*(3), 232–239. https://doi.org/10.1111/j.1741-3729.2010.00598.x

Feeney, B. C. (2004). A secure base: Responsive support of goal strivings and exploration in adult intimate relationships. *Journal of Personality and Social Psychology, 87*(5), 631–648. https://doi.org/10.1037/0022-3514.87.5.631

Fiese, B. H., Tomcho, T. J., Douglas, M., Josephs, K., Poltrock, S., & Baker, T. (2002). A review of 50 years of research on naturally occurring family routines and rituals: Cause for celebration? *Journal of Family Psychology, 16*(4), 381–390. https://doi.org/10.1037/0893-3200.16.4.381

Finkel, E. J., Slotter, E. B., Luchies, L. B., Walton, G. M., & Gross, J. J. (2013). A brief intervention to promote conflict reappraisal preserves marital quality over time. *Psychological Science, 24*(8), 1595–1601. https://doi.org/10.1177/0956797612474938

Frattaroli, J. (2006). Experimental disclosure and its moderators: A meta-analysis. *Psychological Bulletin, 132*(6), 823–865. https://doi.org/10.1037/0033-2909.132.6.823

Gable, S. L., Gonzaga, G. C., & Strachman, A. (2006). Will you be there for me when things go right? Supportive responses to positive event disclosures. *Journal of Personality and Social Psychology, 91*(5), 904–917. https://doi.org/10.1037/0022-3514.91.5.904

Gable, S. L., Reis, H. T., Impett, E. A., & Asher, E. R. (2004). What do you do when things go right? The intrapersonal and interpersonal benefits of sharing positive events. *Journal of Personality and Social Psychology, 87*(2), 228–245. https://doi.org/10.1037/0022-3514.87.2.228

Gordon, A. M., Impett, E. A., Kogan, A., Oveis, C., & Keltner, D. (2012). To have and to hold: Gratitude promotes relationship maintenance in intimate bonds. *Journal of Personality and Social Psychology, 103*(2), 257–274. https://doi.org/10.1037/a0028723

Gottman, J. M., & DeClaire, J. (2001). *The relationship cure: A five-step guide for building better connections with family, friends, and lovers*. Crown. https://openlibrary.org/books/OL7585797M

Gottman, J. M., & Driver, J. L. (2005). Dysfunctional marital conflict and everyday marital interaction. *Journal of Divorce & Remarriage, 43*(3–4), 63–77. https://doi.org/10.1300/J087v43n03_04

Gottman, J. M., & Levenson, R. W. (1992). Marital processes predictive of later dissolution: Behavior, physiology, and health. *Journal of Personality and Social Psychology, 63*(2), 221–233. https://doi.org/10.1037/0022-3514.63.2.221

Gottman, J. M., & Levenson, R. W. (2000). The timing of divorce: Predicting when a couple will divorce over a 14-year period. *Journal of Marriage and Family, 62*(3), 737–745. https://doi.org/10.1111/j.1741-3737.2000.00737.x

Gottman, J. M., & Silver, N. (1999). *The seven principles for making marriage work*. Crown. https://openlibrary.org/books/OL382981M

Hawkins, A. J., Blanchard, V. L., Baldwin, S. A., & Fawcett, E. B. (2008). Does marriage and relationship education work? A meta-analytic study. *Journal of Consulting and Clinical Psychology, 76*(5), 723–734. https://doi.org/10.1037/a0012584

Hazan, C., & Shaver, P. (1987). Romantic love conceptualized as an attachment process. *Journal of Personality and Social Psychology, 52*(3), 511–524. https://doi.org/10.1037/0022-3514.52.3.511

Heyman, R. E., & Slep, A. M. S. (2001). The hazards of predicting divorce without crossvalidation. *Journal of Marriage and Family, 63*(2), 473–479. https://doi.org/10.1111/j.1741-3737.2001.00473.x

Huang, K., Yeomans, M., Brooks, A. W., Minson, J., & Gino, F. (2017). It doesn't hurt to ask: Question-asking increases liking. *Journal of Personality and Social Psychology, 113*(3), 430–452. https://doi.org/10.1037/pspi0000097 (Correction published 2025 after an independent audit: *Journal of Personality and Social Psychology, 128*(3), 669. https://doi.org/10.1037/pspi0000491)

Impett, E. A., Park, H. G., & Muise, A. (2024). Popular psychology through a scientific lens: Evaluating love languages from a relationship science perspective. *Current Directions in Psychological Science, 33*(2), 87–92. https://doi.org/10.1177/09637214231217663

Kardas, M., Kumar, A., & Epley, N. (2022). Overly shallow?: Miscalibrated expectations create a barrier to deeper conversation. *Journal of Personality and Social Psychology, 122*(3), 367–398. https://doi.org/10.1037/pspa0000281

Kuperberg, A. (2014). Age at coresidence, premarital cohabitation, and marriage dissolution: 1985–2009. *Journal of Marriage and Family, 76*(2), 352–369. https://doi.org/10.1111/jomf.12092

Lachance-Grzela, M., & Bouchard, G. (2010). Why do women do the lion's share of housework? A decade of research. *Sex Roles, 63*(11–12), 767–780. https://doi.org/10.1007/s11199-010-9797-z

Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology, 40*(6), 998–1009. https://doi.org/10.1002/ejsp.674

Laurenceau, J.-P., Barrett, L. F., & Pietromonaco, P. R. (1998). Intimacy as an interpersonal process: The importance of self-disclosure, partner disclosure, and perceived partner responsiveness in interpersonal exchanges. *Journal of Personality and Social Psychology, 74*(5), 1238–1251. https://doi.org/10.1037/0022-3514.74.5.1238

Le, B., & Agnew, C. R. (2003). Commitment and its theorized determinants: A meta-analysis of the Investment Model. *Personal Relationships, 10*(1), 37–57. https://doi.org/10.1111/1475-6811.00035

Mahoney, A., Pargament, K. I., Jewell, T., Swank, A. B., Scott, E., Emery, E., & Rye, M. (1999). Marriage and the spiritual realm: The role of proximal and distal religious constructs in marital functioning. *Journal of Family Psychology, 13*(3), 321–338. https://doi.org/10.1037/0893-3200.13.3.321

Mallory, A. B. (2022). Dimensions of couples' sexual communication, relationship satisfaction, and sexual satisfaction: A meta-analysis. *Journal of Family Psychology, 36*(3), 358–371. https://doi.org/10.1037/fam0000946

Mallory, A. B., Stanton, A. M., & Handy, A. B. (2019). Couples' sexual communication and dimensions of sexual function: A meta-analysis. *The Journal of Sex Research, 56*(7), 882–898. https://doi.org/10.1080/00224499.2019.1568375

Mitnick, D. M., Heyman, R. E., & Smith Slep, A. M. (2009). Changes in relationship satisfaction across the transition to parenthood: A meta-analysis. *Journal of Family Psychology, 23*(6), 848–852. https://doi.org/10.1037/a0017004

Mostova, O., Stolarski, M., & Matthews, G. (2022). I love the way you love me: Responding to partner's love language preferences boosts satisfaction in romantic heterosexual couples. *PLOS ONE, 17*(6), e0269429. https://doi.org/10.1371/journal.pone.0269429

Muise, A., Impett, E. A., Kogan, A., & Desmarais, S. (2013). Keeping the spark alive: Being motivated to meet a partner's sexual needs sustains sexual desire in long-term romantic relationships. *Social Psychological and Personality Science, 4*(3), 267–273. https://doi.org/10.1177/1948550612457185

Neff, L. A., & Karney, B. R. (2009). Stress and reactivity to daily relationship experiences: How stress hinders adaptive processes in marriage. *Journal of Personality and Social Psychology, 97*(3), 435–450. https://doi.org/10.1037/a0015663

Orbuch, T. L., Bauermeister, J. A., Brown, E., & McKinley, B.-D. (2013). Early family ties and marital stability over 16 years: The context of race and gender. *Family Relations, 62*(2), 255–268. https://doi.org/10.1111/fare.12005

Owen, J., Rhoades, G. K., & Stanley, S. M. (2013). Sliding versus deciding in relationships: Associations with relationship quality, commitment, and infidelity. *Journal of Couple & Relationship Therapy, 12*(2), 135–149. https://doi.org/10.1080/15332691.2013.779097

Papp, L. M., Cummings, E. M., & Goeke-Morey, M. C. (2009). For richer, for poorer: Money as a topic of marital conflict in the home. *Family Relations, 58*(1), 91–103. https://doi.org/10.1111/j.1741-3729.2008.00537.x

Pennebaker, J. W. (1997). Writing about emotional experiences as a therapeutic process. *Psychological Science, 8*(3), 162–166. https://doi.org/10.1111/j.1467-9280.1997.tb00403.x

Prime, H., Muise, A., Jambon, M., Koven, M., Markwell, A., & Wade, M. (2024). A pilot randomized controlled trial of a brief conflict reappraisal intervention for community couples with young children. *Cognitive Therapy and Research, 48*(5), 895–909. https://doi.org/10.1007/s10608-024-10485-x

Rathgeber, M., Bürkner, P.-C., Schiller, E.-M., & Holling, H. (2019). The efficacy of emotionally focused couples therapy and behavioral couples therapy: A meta-analysis. *Journal of Marital and Family Therapy, 45*(3), 447–463. https://doi.org/10.1111/jmft.12336

Reis, H. T., Clark, M. S., & Holmes, J. G. (2004). Perceived partner responsiveness as an organizing construct in the study of intimacy and closeness. In D. J. Mashek & A. P. Aron (Eds.), *Handbook of closeness and intimacy* (pp. 201–225). Lawrence Erlbaum Associates. https://doi.org/10.4324/9781410610010

Reis, H. T., & Shaver, P. (1988). Intimacy as an interpersonal process. In S. Duck (Ed.), *Handbook of personal relationships* (pp. 367–389). Wiley. Reprinted in H. T. Reis (2018), *Relationships, well-being and behaviour* (pp. 113–143). Routledge. https://doi.org/10.4324/9780203732496-5

Rhoades, G. K., Stanley, S. M., & Markman, H. J. (2009). The pre-engagement cohabitation effect: A replication and extension of previous findings. *Journal of Family Psychology, 23*(1), 107–111. https://doi.org/10.1037/a0014358

Rosenfeld, M. J., & Roesler, K. (2019). Cohabitation experience and cohabitation's association with marital dissolution. *Journal of Marriage and Family, 81*(1), 42–58. https://doi.org/10.1111/jomf.12530

Rusbult, C. E. (1980). Commitment and satisfaction in romantic associations: A test of the investment model. *Journal of Experimental Social Psychology, 16*(2), 172–186. https://doi.org/10.1016/0022-1031(80)90007-4

Shapiro, A. F., Gottman, J. M., & Carrère, S. (2000). The baby and the marriage: Identifying factors that buffer against decline in marital satisfaction after the first baby arrives. *Journal of Family Psychology, 14*(1), 59–70. https://doi.org/10.1037/0893-3200.14.1.59

Slatcher, R. B., & Pennebaker, J. W. (2006). How do I love thee? Let me count the words: The social effects of expressive writing. *Psychological Science, 17*(8), 660–664. https://doi.org/10.1111/j.1467-9280.2006.01762.x

Sprecher, S., Treger, S., Wondra, J. D., Hilaire, N., & Wallpe, K. (2013). Taking turns: Reciprocal self-disclosure promotes liking in initial interactions. *Journal of Experimental Social Psychology, 49*(5), 860–866. https://doi.org/10.1016/j.jesp.2013.03.017

Stanley, S. M., Bradbury, T. N., & Markman, H. J. (2000). Structural flaws in the bridge from basic research on marriage to interventions for couples. *Journal of Marriage and Family, 62*(1), 256–264. https://doi.org/10.1111/j.1741-3737.2000.00256.x

Stanley, S. M., & Markman, H. J. (1992). Assessing commitment in personal relationships. *Journal of Marriage and the Family, 54*(3), 595–608. https://doi.org/10.2307/353245

Stanley, S. M., Rhoades, G. K., & Markman, H. J. (2006). Sliding versus deciding: Inertia and the premarital cohabitation effect. *Family Relations, 55*(4), 499–509. https://doi.org/10.1111/j.1741-3729.2006.00418.x

Twenge, J. M., Campbell, W. K., & Foster, C. A. (2003). Parenthood and marital satisfaction: A meta-analytic review. *Journal of Marriage and Family, 65*(3), 574–583. https://doi.org/10.1111/j.1741-3737.2003.00574.x

Wiebe, S. A., & Johnson, S. M. (2016). A review of the research in emotionally focused therapy for couples. *Family Process, 55*(3), 390–407. https://doi.org/10.1111/famp.12229

Wieselquist, J., Rusbult, C. E., Foster, C. A., & Agnew, C. R. (1999). Commitment, pro-relationship behavior, and trust in close relationships. *Journal of Personality and Social Psychology, 77*(5), 942–966. https://doi.org/10.1037/0022-3514.77.5.942

Woods, S., Lambert, N., Brown, P., Fincham, F., & May, R. (2015). "I'm so excited for you!" How an enthusiastic responding intervention enhances close relationships. *Journal of Social and Personal Relationships, 32*(1), 24–40. https://doi.org/10.1177/0265407514523545
