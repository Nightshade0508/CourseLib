"""Writes public/data/en-words.txt: the 40,000 most frequent English word forms, most frequent first.
The progressive-Chinese learning mode compares each word's rank with the reader's estimated vocabulary.
Data: wordfreq (https://github.com/rspeer/wordfreq), code Apache-2.0, word lists CC BY-SA 4.0.
Run:  python3 -m venv .venv && .venv/bin/pip install wordfreq && .venv/bin/python scripts/make-wordlist.py
"""
import re
from wordfreq import top_n_list

words = [w for w in top_n_list('en', 60000, wordlist='best')
         if re.fullmatch(r"[a-z]+(?:'[a-z]+)?(?:-[a-z]+)*", w)][:40000]
with open('public/data/en-words.txt', 'w') as f:
    f.write('\n'.join(words) + '\n')
print(len(words), 'words')
