[00:00] WOMAN: A model sees, "Hello, my name is Jessica Oyang," and has no idea what to do with that last name.
[00:06] MAN: Because Oyang isn't in its dictionary?
[00:08] WOMAN: Exactly. Welcome to Clutch. Today we'll trace the path from that problem. First, teaching models to copy.
[00:16] MAN: Then handling the repetition problem with a coverage vector, and finally generalizing the whole idea to build the transformer.
[00:22] WOMAN: By the end, you'll explain how multi-head attention works and why a transformer can train in parallel.
[00:28] MAN: And we'll get quizzed along the way?
[00:30] WOMAN: We will, so be ready to pause and try the questions. Let's start with that fundamental problem.
[00:35] MAN: Okay, so what does a standard model do with a name like Oyang if it can't copy?
[00:39] WOMAN: Well, these neural models have a fixed vocabulary, a list of words they know. It's finite.
[00:45] MAN: And there are way more words than that in the world, especially with names and new slang.
[00:49] WOMAN: Right. If a word isn't on that list, it doesn't have a pre-trained word embedding.
[00:53] MAN: So no representation at all.
[00:55] WOMAN: None. And if there's no embedding, the decoder just can't generate it. It doesn't exist in its world.
[01:01] MAN: So it just crashes?
[01:02] WOMAN: The standard fix is to have a special token for unknown word, usually written as UNK.
[01:08] MAN: Ah, generic placeholder. I guess that's better than nothing.
[01:11] WOMAN: It is, but the source material says this approach is kind of lame.
[01:15] MAN: Why lame?
[01:16] WOMAN: Because you get these really unhelpful outputs. The example from the lecture is, "My dog unk is named after unk unk."
[01:24] MAN: That's completely useless. You've lost all the specific information.
[01:27] WOMAN: Exactly. The model just throws up its hands.
[01:30] MAN: Right. And it feels so unnatural. We humans handle this sort of thing constantly without even thinking about it.
[01:36] WOMAN: We do. It's like hearing a new name at a party. You don't need to know its meaning to use it correctly.
[01:42] MAN: If someone says, "Hello, my name is Jessica Oyang," I can immediately say, "Nice to meet you, Dr. Oyang."
[01:48] WOMAN: And you can do that because the name was in your input, not because it was in your pre-existing vocabulary.
[01:53] MAN: I don't need to know anything about the name Oyang. I just hear it, store it for a second, and repeat it back. I copy it.
[01:59] WOMAN: And you even integrate it grammatically, adding doctor in front. You're manipulating a symbol you don't fully know.
[02:05] MAN: So if the model is trapped by its vocabulary, how can we possibly get it to say a word that isn't on the list?
[02:11] WOMAN: That's the core problem. The decoder's whole job is to output a probability distribution over its fixed vocabulary. It's boxed in.
[02:18] MAN: The whole output layer is a fixed size, so it's trapped.
[02:22] WOMAN: Right. So the idea is to give the decoder a second option.
[02:25] MAN: Besides generating from the vocabulary?
[02:27] WOMAN: Exactly. We don't just want to generate, we also want to be able to copy words directly from the input.
[02:34] MAN: So at every step it has a choice: generate or copy. This is the pointer generator network.
[02:39] WOMAN: It is. A good way to think about it is like a switch on a train track.
[02:44] MAN: Okay, how so?
[02:45] WOMAN: At each step, the model has to decide which track to send the output down.
[02:49] MAN: And two tracks lead to different places.
[02:52] WOMAN: One track goes to vocabulary city to generate a word. The other diverts to the source text siding to copy a word.
[02:59] MAN: And who's the switch operator making that call?
[03:02] WOMAN: That switch operator is a learned probability. It's a value calculated at each step that decides how much to generate and how much to copy.
[03:10] MAN: So it's not a hard switch, it's more like a blend, a knob you can turn.
[03:14] WOMAN: Exactly. We call it the Pgen probability, for generation probability.
[03:19] MAN: Okay, so this Pgen probability is the key. How does the model calculate it?
[03:24] WOMAN: It's calculated at each step based on the previous word, the current decoder state, and the context vector from attention.
[03:31] MAN: So it's looking at everything it has available. What's the formula?
[03:34] WOMAN: The Pgen probability is a sigmoid over VY times YJ minus one, plus VD times DJ, plus VC times CJ.
[03:43] MAN: So it's a weighted sum of those inputs, squashed between zero and one. It learns to weigh them to make the call.
[03:49] WOMAN: Right. And that Pgen value is then used to create a blended probability for the final output word.
[03:55] MAN: How does that blend work? What's the final probability formula?
[03:59] WOMAN: The final probability for any word W is Pgen times its vocabulary probability, plus one minus Pgen times its copy probability.
[04:08] MAN: A weighted average. If Pgen is high, we're mostly generating. If it's low, we're mostly copying.
[04:13] WOMAN: Exactly. And the clever part is where that copy probability comes from.
[04:18] MAN: It has to be the attention scores, right?
[04:20] WOMAN: You got it. The attention distribution over the input words serves as the copy probabilities.
[04:26] MAN: The pointer.
[04:27] WOMAN: This is the pointer part of the network.
[04:29] MAN: Ah, so if Oyang has a high attention score, it has a high chance of being copied, and its vocabulary probability is zero.
[04:36] WOMAN: Perfect. And a common word that's not in the input has zero copy probability. It has to be in one place or the other.
[04:43] MAN: The diagram in the slides really clarifies this. It shows the two streams being mixed together by Pgen.
[04:48] WOMAN: Yes, the diagram shows that Pgen value acting like a gate.
[04:52] MAN: A gate between the two streams?
[04:54] WOMAN: It controls how much of the green vocabulary distribution gets mixed with the blue attention distribution for the final output.
[05:01] WOMAN: Okay, pause here and try this one yourself. The Pgen value is a learned probability. What two actions is it balancing between at each step of the decoder?
[05:13] WOMAN: Okay, what did you get?
[05:14] MAN: It's balancing between generating a new word from its vocabulary or pointing to a word that was in the input and copying it.
[05:21] WOMAN: That's it. It's balancing between generating from the fixed vocabulary and copying directly from the input source text.
[05:27] MAN: Got it. That makes sense.
[05:28] WOMAN: So, copying is handled. The Oyang name gets through.
[05:32] MAN: But does that fix everything? What stops the model from getting stuck on one word and copying it over and over?
[05:37] WOMAN: That is a separate problem, and the lecture flags it for encoder-decoder models in general: repetition and deletion.
[05:43] MAN: So it might repeat a phrase?
[05:45] WOMAN: Or just completely skip a part of the input it was supposed to translate. There's a striking visual in the slides.
[05:50] MAN: What does it show?
[05:51] WOMAN: The model should translate, "Many airports were forced to close."
[05:55] MAN: But it doesn't?
[05:56] WOMAN: It outputs, "Many airports were close to close."
[05:59] MAN: So it deleted "forced to" and repeated "close." That's a terrible translation. It lost the meaning.
[06:05] WOMAN: Completely. It's a common failure mode.
[06:07] MAN: So how do you fix that? How do you give the model a memory of what it's already covered?
[06:11] WOMAN: The idea for a fix actually comes from older phrase-based machine translation systems. They kept something called a coverage vector.
[06:19] MAN: Coverage? What's the analogy here?
[06:21] WOMAN: Think of it like a checklist for packing a suitcase. The checklist is your input sentence.
[06:26] MAN: And the translation is the suitcase.
[06:28] WOMAN: Exactly. As you pack each word into your translation, you tick it off.
[06:33] MAN: So you don't pack the same shirt twice and you don't forget your toothbrush.
[06:36] WOMAN: Exactly. But in our neural model, when the decoder generates a word, how do we know which input word it corresponds to?
[06:44] MAN: Which item do we tick off the list?
[06:46] WOMAN: Right. The answer is the attention weights. They tell us what the decoder was looking at when it produced the word.
[06:52] MAN: Of course, the attention distribution is our guide to what's been packed. It's the check mark.
[06:57] WOMAN: So, this coverage vector is just an accumulation of attention scores?
[07:02] MAN: Yes, a running total. The formula says coverage is sum of the attention vectors from all previous decoder steps.
[07:09] WOMAN: So, it's a vector with one number for each source word, representing the total attention that word has received so far.
[07:16] MAN: A memory of where attention has been.
[07:18] WOMAN: That's it. And then we do something clever with that memory.
[07:21] MAN: Which is?
[07:22] WOMAN: We feed it back into the attention calculation for the current step.
[07:26] MAN: Why do that?
[07:27] WOMAN: To discourage attending to words that have already received high attention.
[07:31] MAN: So it actually changes the formula for attention?
[07:33] WOMAN: It does. For attention with coverage, the energy score includes a new term.
[07:39] MAN: Which is?
[07:40] WOMAN: The coverage vector itself. The formula is VE times the tan of V1 HI plus V2 DJ minus one, plus VC times the coverage vector.
[07:51] MAN: So it gets added in right before the soft max? It's influencing the raw scores directly.
[07:56] WOMAN: It's a penalty for re-attending, but that's not all. We also add a penalty directly to the loss function during training.
[08:04] MAN: Hold on, why both? That sounds like you're penalizing it twice.
[08:07] WOMAN: It's a stronger, more direct signal. Modifying the attention score guides the decision-making process.
[08:14] MAN: And the loss function?
[08:15] WOMAN: The coverage loss explicitly punishes the model for a bad outcome.
[08:19] MAN: What does that loss formula look like?
[08:21] WOMAN: The coverage loss is a lambda weighted sum over I of the minimum of AI and coverage I.
[08:27] MAN: So you're training it from two different angles to spread its attention out over the whole input. Don't stare.
[08:32] WOMAN: That's the goal. It's a much more robust way to prevent repetition.
[08:36] MAN: This is getting pretty complex. We started with attention, then used it to copy, then used it to track coverage. Is there a more general way to think about what attention actually is?
[08:45] WOMAN: There is. So far, we've only seen decoders with attention over the encoder hidden states.
[08:50] MAN: And we can generalize from that?
[08:52] WOMAN: We can. We can abstract this into a more general framework based on queries, keys, and values.
[08:57] MAN: Queries, keys, and values. That sounds like information retrieval, like a search engine.
[09:03] WOMAN: That's exactly where the terminology comes from. It's a really powerful way to think about it.
[09:08] MAN: Okay, so what's the analogy for this one?
[09:10] WOMAN: Let's imagine a librarian finding a book. It's a classic for a reason.
[09:14] MAN: I'm with you.
[09:15] WOMAN: You provide a query, what you're interested in. The librarian scans the keys, like the titles on the shelves, to find a match.
[09:23] MAN: And then returns the book.
[09:24] WOMAN: Exactly. The librarian returns the value, the book itself.
[09:28] MAN: That makes sense. So in our encoder-decoder model, what is the query?
[09:33] WOMAN: The query, Q, is the decoder's hidden state. It's the question the decoder is asking at that time step.
[09:39] MAN: Like, given what I've said so far, what part of the source is most relevant now?
[09:43] WOMAN: Exactly. And the keys and values are both the encoder hidden states.
[09:48] MAN: Both of them?
[09:49] WOMAN: Yes. It's scanning the input and retrieving from that same input.
[09:53] MAN: So the key and value are the same here.
[09:55] WOMAN: Right. In natural language processing, they almost always are.
[09:58] MAN: So the attention score is just a function of the query and the key?
[10:03] WOMAN: Precisely. The score, E sub I, is calculated by a function alpha of the query and key, Q and K sub I.
[10:10] MAN: And the output?
[10:11] WOMAN: After the softmax, the context vector C is the weighted sum of values, which is the sum over I of AI times VI.
[10:19] MAN: So the formulas are the same, we're just giving the parts more general names.
[10:23] WOMAN: Exactly. And this generalization lets us do new things. For instance, what if the query, key, and value all come from the same source?
[10:31] MAN: What does that mean? The decoder attending to itself?
[10:35] WOMAN: Precisely. It's a powerful idea called self-attention.
[10:38] MAN: So what's the query?
[10:40] WOMAN: The query is the current decoder state, and the keys and values are the previous decoder states.
[10:45] MAN: So it can look back at the words it's already generated to decide on the next one. This is also called intra-attention.
[10:52] WOMAN: You got it. It helps maintain consistency over a long generation.
[10:56] WOMAN: Okay, pause and try this. In the query key value framework for a standard encoder-decoder, what part of the model provides the query and what provides the keys and values?
[11:09] WOMAN: All right, what did you come up with?
[11:11] MAN: The query is the decoder state, and the keys are the encoder states, and the values are also the encoder states.
[11:19] WOMAN: That's exactly right. The query comes from the decoder's current hidden state, and both the keys and values are the encoder's hidden states.
[11:27] MAN: Okay, QKV is a clean framework. But I'm thinking about that librarian again. What if my query is complex? I want a book about history, but also one that's funny. Can one relevant score really capture that?
[11:40] WOMAN: That's a perfect way to frame the problem. A single attention mechanism can struggle to capture different kinds of relevance at the same time.
[11:47] MAN: Can you give me a language example?
[11:49] WOMAN: Sure. Consider, "The happy cat purrs." If the query is purrs, the word cat is relevant for grammatical reasons.
[11:57] MAN: Okay, subject-verb agreement, singular.
[11:59] WOMAN: But happy is relevant for semantic reasons. Happy cats purr. It's a different kind of connection.
[12:05] MAN: Right, two totally different reasons to pay attention. One score can't tell you which is which.
[12:10] WOMAN: So the idea is, why use only one attention network? We can use multiple attention heads.
[12:16] MAN: Like a panel of judges at a talent show. One judge focuses on vocals, another on stage presence, a third on musicality.
[12:24] WOMAN: That's a great way to put it. They all watch the same performance but look for different things. Each head can learn to focus on a different type of relevance.
[12:32] MAN: How do they know what to focus on?
[12:34] WOMAN: Each head gets its own set of learned weight matrices. Before calculating attention, it projects the query, key, and value into its own private subspace.
[12:43] MAN: So each judge gets their own special filtered view of the performance.
[12:47] WOMAN: Exactly. The formula for a single attention head is attention applied to WIQ, UIK, and VIV. Those W, U, and V matrices create the specialized view.
[12:59] MAN: And then at the end, you combine all the outputs.
[13:01] WOMAN: We concatenate the heads. The formula is multi-head equals WO applied to the concatenation of head one through head H.
[13:09] MAN: The head judge combines all the scores.
[13:11] WOMAN: Okay, let's take a breath here. We've built up a lot of ideas piece by piece.
[13:16] MAN: Right. We started with the Oyang problem and built a copy network to solve it.
[13:21] WOMAN: Then we tackled repetition and deletion with the coverage vector, our suitcase checklist.
[13:26] MAN: Which led us to generalize the whole thing into the librarian model: queries, keys, and values.
[13:31] WOMAN: And then we gave our librarian a panel of expert judges with multi-head attention. Now we're ready for the final step.
[13:38] MAN: So where do we go from here? It feels like we have a powerful system, so what's the final step?
[13:43] WOMAN: The final step is to build a model with only attention. The famous 2017 paper was titled, "Attention Is All You Need."
[13:51] MAN: Wait, hold on. Only attention? Don't we need the recurrence of an RNN to handle the sequence?
[13:56] WOMAN: That paper argued we don't. They introduced the transformer, a sequence-to-sequence model that uses only attention and feed-forward layers.
[14:04] MAN: Why? What's the benefit of throwing out the RNN?
[14:07] WOMAN: Efficiency. In an RNN, you have to compute the hidden state for word one before you can get to word two.
[14:13] MAN: It's inherently sequential, a bottleneck.
[14:16] WOMAN: Exactly. Without that, we can do all the calculations in the encoder in parallel.
[14:20] MAN: So it's like a modern car assembly line. Multiple stations work on all the parts in parallel instead of one person building a whole car step-by-step.
[14:29] WOMAN: That's the perfect analogy. In the transformer's encoder, we use multi-head self-attention.
[14:34] MAN: How does that work?
[14:35] WOMAN: For each word, the query is that word, and the keys and values are all the other words.
[14:41] MAN: So every word is looking at every other word all at the same time.
[14:45] WOMAN: Simultaneously. We pack the queries, keys, and values into big matrices to do it all with one massive computation.
[14:53] MAN: And the car passes through the line multiple times?
[14:56] WOMAN: Yes, the output of one layer of attention becomes the input to the next. The slides show a stack of six layers, each one refining the representation.
[15:05] MAN: What does that massive computation look like? Is it a new kind of attention?
[15:10] WOMAN: The transformer uses a specific, highly optimized kind called scaled dot product attention. It's a single big matrix operation.
[15:18] MAN: What's the formula?
[15:19] WOMAN: The formula for attention is the softmax of Q times K transpose divided by the square root of DK. All of that then multiplied by V.
[15:27] MAN: Whoa, QK transpose, that's comparing every query to every key all at once. And why divide by the square root of DK?
[15:35] WOMAN: That's the scaled part. It's a normalization factor that helps keep the numbers stable during training.
[15:40] MAN: But I have to push back again. If there's no recurrence, how does it know the word order? The cat sat on the mat is very different from the mat sat on the cat.
[15:48] WOMAN: You've hit on it. Without recurrence, the lost word order information is a huge problem. We have to add it back artificially.
[15:54] MAN: How do you add it back?
[15:55] WOMAN: Using position embeddings. You add another vector to each word's embedding that just encodes its position.
[16:01] MAN: Like a little tag saying first?
[16:04] WOMAN: Right, you are position one, you are position two, and so on.
[16:07] MAN: So, the full architecture in the diagram is a stack of these self-attention layers in the encoder, and a similar stack in the decoder.
[16:14] WOMAN: Almost. The decoder is a bit more complex. It has two multi-head attention blocks per layer.
[16:20] MAN: Two? What do they both do?
[16:22] WOMAN: The first is masked self-attention on the words generated so far.
[16:25] MAN: Masked, so it can't cheat and look ahead at future words.
[16:29] WOMAN: Right. And the second block is normal attention, where the query comes from the decoder and the keys and values come from the encoder's final output.
[16:37] MAN: This parallel assembly line sounds amazing. Is it just faster and better in every way? It sounds too good to be true.
[16:43] WOMAN: It's not. There are definite tradeoffs. It's theoretically efficient to train, yes, but in practice, you need very large models to get good performance.
[16:52] MAN: And what about when it's actually generating the translation? Is that parallel too?
[16:56] WOMAN: That's the main catch. The slower decoding is still auto-regressive.
[17:01] MAN: Meaning one word at a time?
[17:02] WOMAN: Yes, it has to feed its output back in as input. That part can't be parallelized. And they're also notoriously sensitive to hyperparameters.
[17:11] MAN: Meaning you have to get the settings just right?
[17:13] WOMAN: Exactly. The learning rate, the number of heads, it all requires careful tuning.
[17:19] WOMAN: Okay, last one. Pause here. The transformer encoder can process all input words in parallel. Why can't the decoder do the same thing during generation?
[17:32] WOMAN: Okay, what do you think?
[17:33] MAN: Because to know what word to say next, it has to know what word it just said. It depends on its own past.
[17:39] WOMAN: That's the core of it. It's auto-regressive. To predict the next word, it needs the words it has already generated as part of its input.
[17:46] MAN: So it can't peek ahead.
[17:48] WOMAN: Exactly. It can't know the full input in advance.
[17:51] MAN: So with all those caveats, large models, slow decoding, finicky tuning, was it actually a step forward?
[17:58] WOMAN: A huge one. The transformer beats both phrase-based and RNN-based machine translation on the standard benchmarks. The performance gains were significant.
[18:06] MAN: And I feel like I hear transformer everywhere now, not just in translation.
[18:10] WOMAN: You do. This architecture is the foundation for almost all modern large language models.
[18:15] MAN: Like Bert and GPT?
[18:18] WOMAN: Exactly. They have transformer architecture at their core.
[18:21] MAN: Okay, so let's trace our entire path one last time. It's a pretty amazing story.
[18:26] WOMAN: Let's do it.
[18:27] MAN: We started with a model that couldn't say Oyang, so we built a copy network that could point to the input, like a train switch.
[18:33] WOMAN: But that model started repeating itself, so we added a coverage vector, the suitcase checklist, to keep track of where attention had already been.
[18:40] MAN: That led us to see attention as a general system of queries, keys, and values, like a librarian and their books.
[18:46] WOMAN: To handle more complex queries, we gave our librarian a panel of judges with multi-head attention.
[18:51] MAN: And finally, we threw out the old slow step-by-step RNN and built a whole new assembly line using only that panel of tension judges, which gave us the transformer.
[19:01] WOMAN: A perfect summary of the journey from a simple problem to a revolutionary architecture.
[19:06] MAN: Okay, what's a good way to lock this in?
[19:07] WOMAN: For your homework, take out your lecture notes and find the diagram of the transformer architecture. Find the decoder's second multi-head attention block.
[19:16] MAN: That's the one that connects the encoder and the decoder, right? The cross-attention.
[19:20] WOMAN: That's it. With a pen, label the arrows from the encoder as keys and values.
[19:25] MAN: Okay.
[19:25] WOMAN: Then label the arrow from the decoder's self-attention as query. It'll help solidify that cross-attention step.
[19:31] MAN: So what's next?
[19:32] WOMAN: Next time, we'll see what happens when you take just the encoder part of the transformer and use it to build powerful contextualized word representations, looking at models like Elmo and Bert.
[19:44] MAN: It's amazing to think that these huge, famous models we hear about all started from trying to solve such a simple human problem.
[19:50] WOMAN: It is. It all came from just trying to figure out how a machine could learn to say, "Nice to meet you, Dr. Oyang."
[19:56] MAN: Thanks for listening.
