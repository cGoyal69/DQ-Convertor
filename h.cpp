#include <iostream>
#include<map>
#include <vector>
#include <set>
#include <algorithm>
#include <regex>
#include <fstream>
using namespace std;

string lowerCase(string query) {
    transform(query.begin(), query.end(), query.begin(), ::tolower);
    return query;
}

string parseFile(const string& filename) {
    ifstream file(filename);
    if (!file.is_open()) {
        cerr << "Error opening file: " << filename << endl;
        return "";
    }
    string str;
    string file_contents;
    while (getline(file, str)) {
        file_contents += str;
    }
    return file_contents;
}

pair<vector<string>,vector<string> > tokens (string query)
{
    vector<string> h;
    vector<string> d;
    string p = "";
    int i, k = true, isString = false;
    char prev = ' ';
    vector<char> bracket = {'1'};

    for(i = 0; i < query.length(); i++)
    {
        if(query[i]==' ' && !isString)
            continue;
        else
        {
            if(bracket.back() != '(' && !isString)
            {
                if (query[i] == '(' || query[i] == '.')
                {
                    if (query[i] == '(')
                        bracket.push_back('(');
                    if (p.length() != 0)
                        h.push_back(p);
                    p = "";
                }
                else
                    p+=query[i];
            }
            else if(query[i] == '\'' || query[i] == '"')
            {
                if (query[i] == prev)
                {
                    prev = ' ';
                    isString = false;
                    p+=query[i];
                }
                else if (prev == ' ')
                {
                    isString = true;
                    prev = query[i];
                    p+=query[i];
                }
            }
            else if(!isString)
            {
                if (query[i] == '(')
                    bracket.push_back('(');
                if(query[i] == ')')
                {
                    bracket.pop_back();
                    if (bracket.back() == '(')
                        p+=")";
                    if(p.length() != 0 && bracket.back() == '1')
                    {
                        h.push_back(p);
                        d.push_back(p);
                        p = "";
                    }
                }
                else
                    p+=query[i];
            }
            else
                p+=query[i];
        }   
    }
    return make_pair(h,d);
}

void JSON(vector<string> d)
{
    
}

int main(void) {
    string filename;
    string query = parseFile("Data.txt");
    query = lowerCase(query);
    pair<vector<string>,vector<string>> tokensQuery = tokens(query);
    for(auto i: tokensQuery.second)
    {
        cout<<i<<endl;
    }
    
    for(auto i: tokensQuery.first)
    {
        cout<<i<<endl;
    }
    
}
